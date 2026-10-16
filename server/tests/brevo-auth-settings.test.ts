import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error Administrative Node helper intentionally has no TS declaration.
import { configureBrevoEmail } from '../scripts/configure-brevo-email.mjs';

const settings = {
  apiKey:'xkeysib-test_fixture_'+'a'.repeat(40), fromEmail:'SCCPMS <sender.fixture@gmail.com>',
  smtpUsername:'fixture@smtp-brevo.com',smtpPassword:'xsmtpsib-test_fixture_'+'b'.repeat(40),
  supabaseUrl:'https://fixtureproject.supabase.co',managementToken:'sbp_test_fixture_management_only',frontendOrigin:'https://clinic.fixture.co.za',
};
function fixture(changes: { active?: boolean; relay?: boolean; rejected?: boolean; ignorePatch?: boolean; writeOnlySecret?: boolean } = {}) {
  let current: Record<string, unknown> = {site_url:settings.frontendOrigin,uri_allow_list:'http://localhost:5173,https://clinic.fixture.co.za/',mailer_otp_exp:7200,mailer_autoconfirm:false,rate_limit_email_sent:2};
  const patches: Record<string, unknown>[]=[];
  const requests: string[]=[];
  const fetcher = async (input: unknown, init?: RequestInit) => {
    const url=String(input); requests.push(url);
    assert.equal(init?.redirect,'error'); assert.ok(init?.signal);
    if(url.startsWith('https://api.brevo.com/')) {
      assert.equal(new Headers(init?.headers).get('api-key'),settings.apiKey);
      if(changes.rejected) return Response.json({code:'unauthorized',message:'Unrecognised IP address 192.0.2.1'}, {status:401});
      if(url.endsWith('/account')) return Response.json({relay:{enabled:changes.relay ?? true,data:{userName:settings.smtpUsername}}});
      if(url.endsWith('/senders')) return Response.json({senders:[{active:changes.active ?? true,email:'sender.fixture@gmail.com'}]});
    }
    assert.equal(url,'https://api.supabase.com/v1/projects/fixtureproject/config/auth');
    assert.equal(new Headers(init?.headers).get('authorization'),`Bearer ${settings.managementToken}`);
    if(init?.method==='PATCH') {
      const patch=JSON.parse(String(init.body));patches.push(patch);
      if(!changes.ignorePatch) current={...current,...patch};
    }
    return Response.json(changes.writeOnlySecret && current.smtp_pass ? {...current,smtp_pass:'a'.repeat(64)} : current);
  };
  return {fetcher,patches,requests,get current(){return current;}};
}

test('Brevo inspection sends no mail or management mutation and redacts credentials', async () => {
  const provider=fixture();
  const result=await configureBrevoEmail(settings,'inspect',provider.fetcher);
  assert.equal(result.gate.ready,true);
  assert.equal(result.smtpConfigured,false);
  assert.equal(provider.patches.length,0);
  for(const value of [settings.apiKey,settings.smtpPassword,settings.smtpUsername,settings.fromEmail,settings.managementToken]) assert.ok(!JSON.stringify(result).includes(value));
  assert.ok(provider.requests.every(url=>!url.includes('/smtp/email')));
});

test('Brevo SMTP uses its SMTP key and verified sender while preserving redirect configuration', async () => {
  const provider=fixture();
  const originalRedirects=provider.current.uri_allow_list;
  const result=await configureBrevoEmail(settings,'apply-smtp',provider.fetcher);
  assert.equal(result.status,'applied'); assert.equal(result.verified,true);
  assert.equal(provider.patches.length,1);
  assert.equal(provider.current.smtp_host,'smtp-relay.brevo.com');
  assert.equal(provider.current.smtp_port,'587');
  assert.equal(provider.current.smtp_pass,settings.smtpPassword);
  assert.notEqual(provider.current.smtp_pass,settings.apiKey);
  assert.equal(provider.current.smtp_admin_email,'sender.fixture@gmail.com');
  assert.equal(provider.current.mailer_autoconfirm,false);
  assert.equal(provider.current.uri_allow_list,originalRedirects);
  assert.equal(provider.current.site_url,settings.frontendOrigin);
  assert.ok(!JSON.stringify(result).includes(settings.smtpPassword));
});

test('write-only hosted SMTP password readback verifies the acknowledged write and preserves templates', async () => {
  const provider=fixture({writeOnlySecret:true});
  const smtp=await configureBrevoEmail(settings,'apply-smtp',provider.fetcher);
  assert.equal(smtp.verified,true);
  assert.equal(smtp.smtpPasswordWriteAcknowledged,true);
  assert.equal(smtp.smtpPasswordStored,true);
  assert.equal(smtp.smtpPasswordWriteOnly,true);
  assert.equal(smtp.smtpKeyMatches,null, 'an opaque marker cannot prove an exact password match');
  assert.equal(provider.current.smtp_pass,settings.smtpPassword);
  const templates=await configureBrevoEmail(settings,'apply-templates',provider.fetcher);
  assert.equal(templates.verified,true);
  assert.equal(provider.current.smtp_pass,settings.smtpPassword);
  assert.ok(!JSON.stringify(smtp).includes(settings.smtpPassword));
});

for(const changes of [{active:false},{relay:false}]) test(`unready Brevo ${Object.keys(changes)[0]} blocks SMTP changes`,async()=>{
  const provider=fixture(changes);
  const result=await configureBrevoEmail(settings,'apply-smtp',provider.fetcher);
  assert.equal(result.status,'blocked');assert.equal(provider.patches.length,0);
});

test('another SMTP username or an API key in place of the SMTP key blocks configuration',async()=>{
  for(const changes of [{smtpUsername:'other@smtp-brevo.com'},{smtpPassword:settings.apiKey}]){
    const provider=fixture();
    const result=await configureBrevoEmail({...settings,...changes},'apply-smtp',provider.fetcher);
    assert.equal(result.status,'blocked');assert.equal(provider.patches.length,0);
  }
});

test('Brevo IP rejection is categorised without exposing the provider body or changing Supabase',async()=>{
  const provider=fixture({rejected:true});
  await assert.rejects(configureBrevoEmail(settings,'apply-smtp',provider.fetcher),{reason:'brevo_ip_authorization',httpStatus:401});
  assert.equal(provider.patches.length,0);
  assert.ok(provider.requests.every(url=>url.startsWith('https://api.brevo.com/')));
});

test('templates preserve configured SMTP and route confirmation, invitation and recovery to the live application',async()=>{
  const provider=fixture();
  await configureBrevoEmail(settings,'apply-smtp',provider.fetcher);
  const result=await configureBrevoEmail(settings,'apply-templates',provider.fetcher);
  assert.equal(result.verified,true);assert.equal(provider.current.smtp_pass,settings.smtpPassword);
  assert.equal(provider.current.mailer_otp_exp,7200);assert.equal(provider.current.mailer_autoconfirm,false);
  for(const flow of ['confirmation','invite','recovery']) assert.match(String(provider.current[`mailer_templates_${flow}_content`]),/\.ConfirmationURL \| urlquery/);
  assert.match(String(provider.current.uri_allow_list),/http:\/\/localhost:5173/);
});

test('templates cannot be installed on unmatched/default SMTP and non-Brevo endpoints are rejected',async()=>{
  const provider=fixture();
  assert.equal((await configureBrevoEmail(settings,'apply-templates',provider.fetcher)).status,'blocked');
  for(const changes of [{smtpHost:'untrusted.fixture.co.za'},{smtpPort:'25'}]) await assert.rejects(configureBrevoEmail({...settings,...changes},'apply-smtp',provider.fetcher),{reason:'secure_brevo_smtp_endpoint_required'});
  assert.equal(provider.patches.length,0);
});
