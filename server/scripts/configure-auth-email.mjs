import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emailSender, validResendKey } from './check-email.mjs';
import { requiredAuthRedirects } from './auth-redirect-settings.mjs';

const dnsDocPath = 'docs/email-delivery.md';
const smtpFields = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_admin_email', 'smtp_sender_name', 'smtp_max_frequency', 'rate_limit_email_sent'];
const flows = [
  ['confirmation', 'signup', 'Confirm your email address', 'Continue to confirm email'],
  ['invite', 'invite', 'Complete your clinic account', 'Continue to set your password'],
  ['recovery', 'recovery', 'Reset your password', 'Continue to reset your password'],
];

export class AuthEmailSettingsError extends Error {
  constructor(reason, httpStatus) {
    super(reason);
    this.name = 'AuthEmailSettingsError';
    this.reason = reason;
    if (Number.isInteger(httpStatus)) this.httpStatus = httpStatus;
  }
}

function productionOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === value) return value;
  } catch { /* Configuration errors never include their input. */ }
  throw new AuthEmailSettingsError('https_frontend_origin_required');
}

function managementUrl(settings) {
  let ref;
  try {
    const url = new URL(settings.supabaseUrl);
    if (url.protocol === 'https:') ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  } catch { /* No credentials or configuration values in errors. */ }
  if (!ref || !settings.managementToken?.trim()) throw new AuthEmailSettingsError('management_configuration_required');
  return `https://api.supabase.com/v1/projects/${ref}/config/auth`;
}

async function request(url, token, fetcher, body, provider = 'management') {
  let response;
  try {
    response = await fetcher(url, {
      method: body ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new AuthEmailSettingsError(`${provider}_network_unavailable`); }
  if (!response.ok) throw new AuthEmailSettingsError(`${provider}_request_rejected`, response.status);
  try { return await response.json(); }
  catch {
    if (body && response.status === 204) return null;
    throw new AuthEmailSettingsError(`${provider}_invalid_response`);
  }
}

function validateManaged(value) {
  if (typeof value?.site_url !== 'string' || typeof value?.uri_allow_list !== 'string') throw new AuthEmailSettingsError('management_invalid_response');
  return value;
}

export function buildLinkPatch(current, frontendOrigin) {
  const origin = productionOrigin(frontendOrigin);
  const previous = current.uri_allow_list.split(',').map(value => value.trim()).filter(Boolean);
  return { site_url: origin, uri_allow_list: [...new Set([...previous, ...requiredAuthRedirects(origin)])].join(','), mailer_otp_exp: 7200, mailer_autoconfirm: false };
}

export function buildTemplatePatch(current, frontendOrigin) {
  const patch = buildLinkPatch(current, frontendOrigin);
  for (const [flow, action, title, button] of flows) {
    patch[`mailer_subjects_${flow}`] = `SCCPMS: ${title}`;
    // GoTrue renders Go html/template; urlquery is its standard URL-query encoder.
    // Loading the application wrapper does not consume the confirmation token.
    const href = `{{ .SiteURL }}/?email_action=${action}&confirmation_url={{ .ConfirmationURL | urlquery }}`;
    patch[`mailer_templates_${flow}_content`] = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;color:#17334e"><p style="font-weight:bold;color:#126a92">SCCPMS</p><h1 style="font-size:24px">${title}</h1><p>Open the clinic application and choose Continue to complete this secure step.</p><p><a href="${href}" style="display:inline-block;background:#126a92;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none">${button}</a></p><p>This link expires in two hours. If you did not request this email, you can ignore it.</p></div>`;
  }
  return patch;
}

export async function inspectSenderDomain(settings, fetcher = fetch) {
  const sender = emailSender(settings.fromEmail);
  const blocked = reason => ({ ready: false, reason, dnsDocPath });
  if (!validResendKey(settings.apiKey)) return blocked('resend_key_required');
  if (!sender || sender.testDomain || sender.reservedDomain) return blocked('custom_sender_required');
  let cursor;
  const seen = new Set();
  for (let page = 0; page < 10; page++) {
    const endpoint = new URL('https://api.resend.com/domains');
    endpoint.searchParams.set('limit', '100');
    if (cursor) endpoint.searchParams.set('after', cursor);
    const list = await request(endpoint, settings.apiKey, fetcher, undefined, 'resend');
    if (!Array.isArray(list?.data)) throw new AuthEmailSettingsError('resend_invalid_response');
    const domain = list.data.find(item => typeof item?.name === 'string' && item.name.toLowerCase() === sender.domain);
    if (domain) {
      if (typeof domain.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(domain.id)) throw new AuthEmailSettingsError('resend_invalid_response');
      const detail = await request(`https://api.resend.com/domains/${domain.id}`, settings.apiKey, fetcher, undefined, 'resend');
      if (typeof detail?.name !== 'string' || detail.name.toLowerCase() !== sender.domain) throw new AuthEmailSettingsError('resend_invalid_response');
      const domainStatus = ['verified', 'pending', 'not_started', 'failed', 'temporary_failure'].includes(detail.status) ? detail.status : 'unknown';
      const reason = detail.status !== 'verified' ? 'domain_pending' : detail.capabilities?.sending !== 'enabled' ? 'sending_disabled'
        : detail.open_tracking !== false || detail.click_tracking !== false ? 'tracking_must_be_disabled' : 'ready';
      return { ready: reason === 'ready', reason, domain: sender.domain, domainStatus, dnsDocPath };
    }
    if (list.has_more !== true) return { ...blocked('domain_pending'), domain: sender.domain, domainStatus: 'not_found' };
    const last = list.data.at(-1)?.id;
    if (typeof last !== 'string' || !/^[a-f0-9-]{36}$/i.test(last) || seen.has(last)) throw new AuthEmailSettingsError('resend_invalid_response');
    seen.add(last); cursor = last;
  }
  throw new AuthEmailSettingsError('resend_domain_lookup_incomplete');
}

function summary(current, settings) {
  let siteUrl = null;
  try { siteUrl = new URL(current.site_url).origin; } catch { /* No raw configuration output. */ }
  return {
    siteUrl, authLinkExpirySeconds: Number.isSafeInteger(current.mailer_otp_exp) && current.mailer_otp_exp >= 0 && current.mailer_otp_exp <= 86400 ? current.mailer_otp_exp : null,
    smtpConfigured: Boolean(current.smtp_host && current.smtp_user && current.smtp_pass),
    smtpHost: typeof current.smtp_host === 'string' && /^[a-z0-9.-]+$/i.test(current.smtp_host) ? current.smtp_host : null,
    senderDomain: emailSender(current.smtp_admin_email)?.domain ?? null,
    smtpKeyMatches: Boolean(settings.apiKey && current.smtp_pass === settings.apiKey.trim()),
  };
}

export async function configureAuthEmail(settings, mode = 'inspect', fetcher = fetch) {
  if (!['inspect', 'apply-links', 'apply-templates', 'apply-smtp'].includes(mode)) throw new AuthEmailSettingsError('unsupported_operation');
  const endpoint = managementUrl(settings);
  if (['apply-links', 'apply-templates'].includes(mode)) productionOrigin(settings.frontendOrigin);
  const current = validateManaged(await request(endpoint, settings.managementToken, fetcher));
  if (mode === 'inspect') return { operation: mode, status: 'inspected', ...summary(current, settings), smtpGate: await inspectSenderDomain(settings, fetcher) };
  let patch;
  if (mode === 'apply-links') patch = buildLinkPatch(current, settings.frontendOrigin);
  else if (mode === 'apply-templates') {
    // Hosted free-tier Auth refuses template changes with its default provider.
    // Prepare links independently, then install templates after verified SMTP.
    if (!summary(current, settings).smtpConfigured) return { operation: mode, status: 'blocked', reason: 'custom_smtp_required_for_templates', ...summary(current, settings), dnsDocPath };
    patch = buildTemplatePatch(current, settings.frontendOrigin);
  }
  else {
    const gate = await inspectSenderDomain(settings, fetcher);
    if (!gate.ready) return { operation: mode, status: 'blocked', ...summary(current, settings), smtpGate: gate };
    const sender = settings.fromEmail.trim().match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? settings.fromEmail.trim();
    patch = { smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: settings.apiKey.trim(),
      smtp_admin_email: sender.trim().toLowerCase(), smtp_sender_name: 'SCCPMS', smtp_max_frequency: 30,
      rate_limit_email_sent: Math.max(Number.isSafeInteger(current.rate_limit_email_sent) ? current.rate_limit_email_sent : 0, 30), mailer_autoconfirm: false };
  }
  const changed = Object.entries(patch).some(([key, value]) => current[key] !== value);
  if (changed) await request(endpoint, settings.managementToken, fetcher, patch);
  let saved, matched = false;
  // The management API can briefly return the prior configuration after a
  // successful PATCH. Retry only reads; never send another settings mutation.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    saved = validateManaged(await request(endpoint, settings.managementToken, fetcher));
    const verified = Object.entries(patch).every(([key, value]) => saved[key] === value);
    const preserved = mode !== 'apply-smtp' ? smtpFields.every(key => saved[key] === current[key])
      : saved.uri_allow_list === current.uri_allow_list && saved.site_url === current.site_url;
    if (verified && preserved) { matched = true; break; }
  }
  if (!matched) throw new AuthEmailSettingsError('management_readback_mismatch');
  return { operation: mode, status: changed ? 'applied' : 'unchanged', ...summary(saved, settings), existingRedirectsPreserved: true,
    ...(mode === 'apply-templates' ? { smtpUnchanged: true, templatesVerified: true } : mode === 'apply-links' ? { smtpUnchanged: true, linksVerified: true } : { smtpVerified: true }) };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length > 1 || argumentsList.some(value => !['--inspect', '--apply-links', '--apply-templates', '--apply-smtp'].includes(value))) throw new AuthEmailSettingsError('choose_one_operation');
  const result = await configureAuthEmail({ supabaseUrl: process.env.SUPABASE_URL, managementToken: process.env.SUPABASE_ACCESS_TOKEN,
    frontendOrigin: process.env.FRONTEND_ORIGIN, apiKey: process.env.RESEND_API_KEY, fromEmail: process.env.RESEND_FROM_EMAIL }, argumentsList[0]?.slice(2) ?? 'inspect');
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'blocked') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(JSON.stringify({ status: 'failed', reason: error instanceof AuthEmailSettingsError ? error.reason : 'configuration_unavailable',
    ...(error instanceof AuthEmailSettingsError && error.httpStatus ? { httpStatus: error.httpStatus } : {}) }));
  process.exitCode = 1;
});
