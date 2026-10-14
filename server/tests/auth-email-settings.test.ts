import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error Operational runner is native JavaScript.
import { AuthEmailSettingsError, configureAuthEmail } from '../scripts/configure-auth-email.mjs';

const settings = {
  supabaseUrl: 'https://fixture.supabase.co', frontendOrigin: 'https://clinic-fixture.example.invalid',
  managementToken: 'fixture-management-token', apiKey: 're_test_fixture_only_0123456789',
  fromEmail: 'SCCPMS Clinic <login@notifications.fixture.co.za>',
};
const domainId = '11111111-1111-4111-8111-111111111111';
const domain = { id: domainId, name: 'notifications.fixture.co.za', status: 'verified',
  capabilities: { sending: 'enabled' }, open_tracking: false, click_tracking: false };
const initial = () => ({
  site_url: 'https://previous-fixture.example.invalid', uri_allow_list: 'https://existing.example.invalid/app,http://localhost:5173',
  smtp_host: 'smtp.previous.example.invalid', smtp_port: '587', smtp_user: 'old-smtp-user', smtp_pass: 'private-existing-password',
  smtp_admin_email: 'sender@previous.example.invalid', smtp_sender_name: 'Existing sender', smtp_max_frequency: 60,
  rate_limit_email_sent: 2, mailer_otp_exp: 3600, mailer_autoconfirm: false,
});
function provider(options: { domain?: Record<string, unknown>; status?: number; ignorePatch?: boolean; corruptReadback?: boolean } = {}) {
  let current: Record<string, unknown> = initial();
  let reads = 0;
  const writes: Record<string, unknown>[] = [];
  const requests: { url: string; method: string }[] = [];
  const fetcher = async (input: string | URL, init: RequestInit) => {
    const url = new URL(input), method = init.method ?? 'GET';
    requests.push({ url: url.href, method });
    if (url.hostname === 'api.resend.com') {
      assert.equal(method, 'GET', 'sender preflight cannot send mail or mutate domains/tracking');
      const selected = options.domain ?? domain;
      return Response.json(url.pathname === '/domains' ? { data: [selected], has_more: false } : selected);
    }
    assert.equal(url.hostname, 'api.supabase.com');
    if (options.status) return Response.json({ message: 'private-provider-payload-must-not-escape' }, { status: options.status });
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init.body));
      writes.push(patch);
      if (!options.ignorePatch) current = { ...current, ...patch };
      return Response.json(current);
    }
    reads++;
    return Response.json(options.corruptReadback && reads > 1 ? { ...current, smtp_pass: 'unexpected-readback-secret' } : current);
  };
  return { fetcher, writes, requests, get current() { return current; } };
}

test('email inspection is read-only and returns readiness without provider credentials or sender mailbox', async () => {
  const mock = provider();
  const summary = await configureAuthEmail(settings, 'inspect', mock.fetcher);
  assert.equal(summary.status, 'inspected');
  assert.equal(summary.smtpConfigured, true);
  assert.equal(summary.smtpHost, initial().smtp_host);
  assert.equal(summary.smtpGate.ready, true);
  assert.equal(mock.writes.length, 0);
  assert.ok(mock.requests.every(request => request.method === 'GET'));
  for (const value of [initial().smtp_pass, initial().smtp_admin_email, settings.apiKey, settings.managementToken]) {
    assert.equal(JSON.stringify(summary).includes(value), false);
  }
  const malformed = provider({ domain: { ...domain, status: settings.apiKey } });
  malformed.current.mailer_otp_exp = settings.managementToken;
  const malformedSummary = await configureAuthEmail(settings, 'inspect', malformed.fetcher);
  assert.equal(malformedSummary.authLinkExpirySeconds, null);
  assert.equal(malformedSummary.smtpGate.domainStatus, 'unknown');
  assert.equal(JSON.stringify(malformedSummary).includes(settings.apiKey), false);
  assert.equal(JSON.stringify(malformedSummary).includes(settings.managementToken), false);
});

test('branded templates use encoded scanner-safe confirmation wrappers and preserve all SMTP and redirects', async () => {
  const mock = provider();
  const summary = await configureAuthEmail(settings, 'apply-templates', mock.fetcher);
  assert.equal(summary.status, 'applied');
  assert.equal(summary.templatesVerified, true);
  assert.equal(summary.smtpUnchanged, true);
  assert.equal(summary.authLinkExpirySeconds, 7200);
  assert.equal(mock.writes.length, 1);
  const patch = mock.writes[0];
  assert.equal(patch.site_url, settings.frontendOrigin);
  assert.equal(patch.mailer_autoconfirm, false);
  assert.ok(String(patch.uri_allow_list).includes(initial().uri_allow_list));
  assert.ok(String(patch.uri_allow_list).includes('/?auth_action=invite'));
  assert.ok(Object.keys(patch).every(key => !key.startsWith('smtp_') && key !== 'rate_limit_email_sent'));
  for (const [flow, action] of [['confirmation', 'signup'], ['invite', 'invite'], ['recovery', 'recovery']]) {
    const body = String(patch[`mailer_templates_${flow}_content`]);
    assert.ok(body.includes(`href="{{ .SiteURL }}/?email_action=${action}&confirmation_url={{ .ConfirmationURL | urlquery }}"`));
    assert.equal((body.match(/ConfirmationURL/g) ?? []).length, 1);
    assert.ok(body.includes('two hours'));
    assert.ok(body.includes('SCCPMS'));
    assert.equal(/href="\{\{\s*\.ConfirmationURL/.test(body), false);
    assert.equal(body.includes('{{ .Token }}'), false);
  }
  assert.equal(mock.requests.some(request => request.url.includes('api.resend.com')), false, 'template repair is independent from SMTP provider readiness');
  const again = await configureAuthEmail(settings, 'apply-templates', mock.fetcher);
  assert.equal(again.status, 'unchanged');
  assert.equal(mock.writes.length, 1);
});

test('template mutation rejects insecure or malformed frontend origins before requesting managed configuration', async () => {
  for (const frontendOrigin of ['http://clinic.example.invalid', 'https://user:password@clinic.example.invalid', 'https://clinic.example.invalid/', 'https://clinic.example.invalid/login']) {
    let requests = 0;
    await assert.rejects(configureAuthEmail({ ...settings, frontendOrigin }, 'apply-templates', async () => { requests++; return Response.json({}); }),
      (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'https_frontend_origin_required');
    assert.equal(requests, 0);
  }
});

test('SMTP remains unchanged when sender domain is pending, sending disabled, tracking enabled or sender is a test domain', async () => {
  const scenarios = [
    { changed: { ...domain, status: 'not_started' }, reason: 'domain_pending' },
    { changed: { ...domain, capabilities: { sending: 'disabled' } }, reason: 'sending_disabled' },
    { changed: { ...domain, click_tracking: true }, reason: 'tracking_must_be_disabled' },
    { changed: { ...domain, name: 'wrong-sender.fixture.co.za' }, reason: 'domain_pending' },
  ];
  for (const scenario of scenarios) {
    const mock = provider({ domain: scenario.changed });
    const summary = await configureAuthEmail(settings, 'apply-smtp', mock.fetcher);
    assert.equal(summary.status, 'blocked');
    assert.equal(summary.smtpGate.reason, scenario.reason);
    assert.equal(summary.smtpGate.dnsDocPath, 'docs/email-delivery.md');
    assert.equal(mock.writes.length, 0);
    assert.deepEqual(mock.current, initial());
  }
  for (const fromEmail of ['SCCPMS <onboarding@resend.dev>', 'clinic@sender.example.invalid', 'bad-address', 'Clinic <login@fixture.co.za>\r\nBcc: injected@fixture.co.za']) {
    const mock = provider();
    const summary = await configureAuthEmail({ ...settings, fromEmail }, 'apply-smtp', mock.fetcher);
    assert.equal(summary.smtpGate.reason, 'custom_sender_required');
    assert.equal(mock.writes.length, 0);
    assert.equal(mock.requests.some(request => request.url.includes('api.resend.com')), false);
  }
});

test('verified generic sender configures Resend SMTP with modest quota and verifies the key without returning it', async () => {
  const mock = provider();
  const summary = await configureAuthEmail(settings, 'apply-smtp', mock.fetcher);
  assert.equal(summary.status, 'applied');
  assert.equal(summary.smtpVerified, true);
  assert.equal(summary.smtpKeyMatches, true);
  assert.equal(summary.senderDomain, domain.name);
  assert.equal(summary.smtpHost, 'smtp.resend.com');
  assert.deepEqual(mock.writes[0], { smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: settings.apiKey,
    smtp_admin_email: 'login@notifications.fixture.co.za', smtp_sender_name: 'SCCPMS', smtp_max_frequency: 30,
    rate_limit_email_sent: 30, mailer_autoconfirm: false });
  assert.equal(mock.current.uri_allow_list, initial().uri_allow_list);
  assert.equal(mock.current.site_url, initial().site_url);
  assert.equal(mock.current.mailer_otp_exp, initial().mailer_otp_exp);
  assert.equal(JSON.stringify(summary).includes(settings.apiKey), false);
  assert.equal(JSON.stringify(summary).includes('login@'), false);
  mock.current.rate_limit_email_sent = 60;
  await configureAuthEmail(settings, 'apply-smtp', mock.fetcher);
  assert.equal(mock.current.rate_limit_email_sent, 60, 'an existing approved higher quota is preserved');
});

test('SMTP preflight traverses domain pages and rejects incomplete or mismatched detail responses without writes', async () => {
  const mock = provider();
  let lists = 0;
  const paged = async (input: string | URL, init: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === 'api.resend.com' && url.pathname === '/domains' && lists++ === 0) {
      return Response.json({ data: [{ ...domain, name: 'different.fixture.co.za' }], has_more: true });
    }
    if (url.hostname === 'api.resend.com' && url.pathname === '/domains') assert.equal(url.searchParams.get('after'), domainId);
    return mock.fetcher(input, init);
  };
  assert.equal((await configureAuthEmail(settings, 'apply-smtp', paged)).smtpVerified, true);
  const failed = provider();
  await assert.rejects(configureAuthEmail(settings, 'apply-smtp', async (input: string | URL, init: RequestInit) => {
    if (new URL(input).pathname === `/domains/${domainId}`) return Response.json({ ...domain, name: 'wrong.fixture.co.za' });
    return failed.fetcher(input, init);
  }), (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'resend_invalid_response');
  assert.equal(failed.writes.length, 0);
});

test('missing management permission and failed PATCH/network requests return only safe errors', async () => {
  let calls = 0;
  await assert.rejects(configureAuthEmail({ ...settings, managementToken: '' }, 'inspect', async () => { calls++; return Response.json({}); }),
    (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'management_configuration_required');
  assert.equal(calls, 0);
  for (const status of [401, 403]) {
    await assert.rejects(configureAuthEmail(settings, 'apply-templates', provider({ status }).fetcher),
      (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'management_request_rejected' && error.httpStatus === status && !String(error).includes('private-provider-payload'));
  }
  const mock = provider();
  await assert.rejects(configureAuthEmail(settings, 'apply-templates', async (input: string | URL, init: RequestInit) => {
    if (init.method === 'PATCH') return Response.json({ message: settings.apiKey }, { status: 500 });
    return mock.fetcher(input, init);
  }), (error: unknown) => error instanceof AuthEmailSettingsError && error.httpStatus === 500 && !JSON.stringify(error).includes(settings.apiKey));
  await assert.rejects(configureAuthEmail(settings, 'inspect', async () => { throw new Error(settings.managementToken); }),
    (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'management_network_unavailable' && !String(error).includes(settings.managementToken));
});

test('readback rejects failed settings writes, SMTP drift during template updates and wrong saved SMTP key', async () => {
  await assert.rejects(configureAuthEmail(settings, 'apply-templates', provider({ ignorePatch: true }).fetcher),
    (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'management_readback_mismatch');
  for (const mode of ['apply-templates', 'apply-smtp']) {
    await assert.rejects(configureAuthEmail(settings, mode, provider({ corruptReadback: true }).fetcher),
      (error: unknown) => error instanceof AuthEmailSettingsError && error.reason === 'management_readback_mismatch' && !JSON.stringify(error).includes('unexpected-readback-secret'));
  }
});
