import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emailSender } from './check-email.mjs';
import { buildTemplatePatch } from './configure-auth-email.mjs';

export class BrevoSetupError extends Error {
  constructor(reason, httpStatus) { super(reason); this.name = 'BrevoSetupError'; this.reason = reason; this.httpStatus = httpStatus; }
}
function address(value) {
  const parsed = emailSender(value);
  if (!parsed || parsed.testDomain || parsed.reservedDomain) return null;
  return (value.trim().match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? value).trim().toLowerCase();
}
async function request(url, headers, fetcher, body) {
  let response;
  try {
    response = await fetcher(url, {method: body ? 'PATCH' : 'GET', headers: {...headers, Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {}), redirect:'error', signal:AbortSignal.timeout(15000)});
  } catch { throw new BrevoSetupError('provider_network_unavailable'); }
  let payload; try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const ip = /unrecogni[sz]ed IP|unrecognised IP|unauthori[sz]ed IP|IP address/i.test(typeof payload?.message === 'string' ? payload.message : '');
    throw new BrevoSetupError(ip ? 'brevo_ip_authorization' : 'provider_request_rejected', response.status);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BrevoSetupError('provider_invalid_response');
  return payload;
}
export async function inspectBrevoEmail(settings, fetcher = fetch) {
  if (!/^xkeysib-[A-Za-z0-9_-]{32,}$/.test(settings.apiKey ?? '')) throw new BrevoSetupError('brevo_api_key_required');
  const headers = {'api-key':settings.apiKey};
  const [account, senders] = await Promise.all([
    request('https://api.brevo.com/v3/account', headers, fetcher), request('https://api.brevo.com/v3/senders', headers, fetcher),
  ]);
  if (!Array.isArray(senders.senders) || typeof account.relay?.enabled !== 'boolean') throw new BrevoSetupError('provider_invalid_response');
  const sender = address(settings.fromEmail);
  const senderVerified = Boolean(sender && senders.senders.some(item => item.active === true && typeof item.email === 'string' && item.email.toLowerCase() === sender));
  const username = account.relay?.data?.userName;
  const usernameMatches = Boolean(typeof username === 'string' && username && settings.smtpUsername === username);
  return {ready:account.relay.enabled && senderVerified && usernameMatches && /^xsmtpsib-[A-Za-z0-9_-]{32,}$/.test(settings.smtpPassword ?? ''),
    relayEnabled:account.relay.enabled, senderVerified, smtpUsernameMatches:usernameMatches,
    activeSenderCount:senders.senders.filter(item=>item.active===true).length};
}
const smtpFields = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_admin_email','smtp_sender_name','smtp_max_frequency','rate_limit_email_sent'];
// Supabase's hosted SMTP password is write-only. GET can return an opaque
// secret marker instead of the password. Verify the PATCH acknowledgement and
// presence separately; actual credentials require a real SMTP/Auth mail check.
function smtpPasswordStored(value) { return typeof value === 'string' && value.length > 0; }
export async function configureBrevoEmail(settings, mode = 'inspect', fetcher = fetch) {
  if (!['inspect','apply-smtp','apply-templates'].includes(mode)) throw new BrevoSetupError('unsupported_operation');
  const gate = await inspectBrevoEmail(settings, fetcher);
  let ref;
  try { const url = new URL(settings.supabaseUrl); if(url.protocol==='https:') ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]; } catch { /* No input in errors. */ }
  if (!ref || !settings.managementToken?.trim()) throw new BrevoSetupError('management_configuration_required');
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = {Authorization:`Bearer ${settings.managementToken.trim()}`};
  const current = await request(endpoint, headers, fetcher);
  if (typeof current.site_url !== 'string' || typeof current.uri_allow_list !== 'string') throw new BrevoSetupError('management_invalid_response');
  const summary = value => ({siteUrl:new URL(value.site_url).origin, smtpConfigured:Boolean(value.smtp_host && value.smtp_user && value.smtp_pass),
    brevoSmtpConfigured:value.smtp_host==='smtp-relay.brevo.com', senderMatches:value.smtp_admin_email===address(settings.fromEmail),
    smtpPasswordStored:smtpPasswordStored(value.smtp_pass), smtpKeyMatches:value.smtp_pass===settings.smtpPassword ? true : null,
    smtpPasswordWriteOnly:smtpPasswordStored(value.smtp_pass) && value.smtp_pass!==settings.smtpPassword, authLinkExpirySeconds:value.mailer_otp_exp});
  if (mode === 'inspect') return {operation:mode,status:'inspected',...summary(current),gate};
  if (!gate.ready) return {operation:mode,status:'blocked',reason:'brevo_sender_relay_or_smtp_credentials_not_ready',gate};
  let patch;
  if (mode === 'apply-smtp') {
    if ((settings.smtpHost || 'smtp-relay.brevo.com')!=='smtp-relay.brevo.com' || !['465','587'].includes(String(settings.smtpPort || 587))) throw new BrevoSetupError('secure_brevo_smtp_endpoint_required');
    patch = {smtp_host:'smtp-relay.brevo.com',smtp_port:String(settings.smtpPort || 587),smtp_user:settings.smtpUsername,smtp_pass:settings.smtpPassword,
      smtp_admin_email:address(settings.fromEmail),smtp_sender_name:'SCCPMS',smtp_max_frequency:30,
      rate_limit_email_sent:Math.max(Number.isSafeInteger(current.rate_limit_email_sent)?current.rate_limit_email_sent:0,30),mailer_autoconfirm:false};
  } else {
    if (current.smtp_host!=='smtp-relay.brevo.com' || !smtpPasswordStored(current.smtp_pass) || current.smtp_user!==settings.smtpUsername
      || current.smtp_admin_email!==address(settings.fromEmail)) return {operation:mode,status:'blocked',reason:'matching_brevo_smtp_required'};
    patch = buildTemplatePatch(current,settings.frontendOrigin);
  }
  const changed = Object.entries(patch).some(([key,value])=>current[key]!==value);
  if (changed) await request(endpoint,headers,fetcher,patch);
  let saved, verified = false;
  for (let attempt=0;attempt<3;attempt++) {
    if(attempt) await new Promise(resolve=>setTimeout(resolve,attempt*500));
    saved = await request(endpoint,headers,fetcher);
    const preserved = mode==='apply-smtp' ? saved.site_url===current.site_url && saved.uri_allow_list===current.uri_allow_list
      : smtpFields.every(key=>saved[key]===current[key]);
    if(preserved && Object.entries(patch).every(([key,value])=>key==='smtp_pass' ? smtpPasswordStored(saved[key]) : saved[key]===value)) {verified=true;break;}
  }
  if(!verified) throw new BrevoSetupError('management_readback_mismatch');
  return {operation:mode,status:changed?'applied':'unchanged',...summary(saved),verified:true,existingRedirectsPreserved:true,
    ...(mode==='apply-smtp'?{smtpPasswordWriteAcknowledged:changed}: {})};
}
async function main() {
  const args=process.argv.slice(2);
  if(args.length>1 || args.some(arg=>!['--inspect','--apply-smtp','--apply-templates'].includes(arg))) throw new BrevoSetupError('choose_one_operation');
  const result=await configureBrevoEmail({apiKey:process.env.BREVO_API_KEY,fromEmail:process.env.BREVO_FROM_EMAIL,
    smtpHost:process.env.BREVO_SMTP_HOST,smtpPort:process.env.BREVO_SMTP_PORT,smtpUsername:process.env.BREVO_SMTP_USERNAME,smtpPassword:process.env.BREVO_SMTP_PASSWORD,
    supabaseUrl:process.env.SUPABASE_URL,managementToken:process.env.SUPABASE_ACCESS_TOKEN,frontendOrigin:process.env.FRONTEND_ORIGIN},args[0]?.slice(2) ?? 'inspect');
  console.log(JSON.stringify(result,null,2));
  if(result.status==='blocked') process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{
  console.error(JSON.stringify({status:'failed',reason:error instanceof BrevoSetupError?error.reason:'configuration_unavailable',
    ...(error instanceof BrevoSetupError && Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{})}));
  process.exitCode=1;
});
