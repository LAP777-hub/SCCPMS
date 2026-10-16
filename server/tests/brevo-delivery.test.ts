import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, configSchema } from '../src/config.js';
import { EmailDeliveryError, selectOtpEmailDelivery, sendOtpEmail, type EmailSettings, type EmailTransport } from '../src/email.js';

const userId = '00000000-0000-4000-8000-000000000171';
const challengeId = '00000000-0000-4000-8000-000000000172';
const email = 'recipient.fixture@outlook.com';
const messageId = '<accepted-fixture-172@relay.brevo.example>';
const settings: EmailSettings = {
  NODE_ENV: 'production', RESEND_API_KEY: 're_test_fixture_only_0123456789', RESEND_FROM_EMAIL: '',
  RESEND_ADMIN_OWNER_EMAIL: 'owner.fixture@gmail.com', RESEND_ADMIN_OWNER_USER_ID: '00000000-0000-4000-8000-000000000173',
  BREVO_API_KEY: 'xkeysib-test_fixture_' + 'a'.repeat(40), BREVO_FROM_EMAIL: 'SCCPMS <sender.fixture@gmail.com>',
};
const patient = { userId, role: 'patient', email };
function fixture(responses: Array<Response | Error> = [Response.json({ messageId }, { status: 201 })]) {
  const calls: Array<{url: string; init: RequestInit}> = [];
  const waits: number[] = [];
  let clock = 0;
  const transport: Partial<EmailTransport> = {
    fetcher: async (url, init) => {
      calls.push({url: String(url), init: init!});
      const response = responses.shift();
      assert.ok(response, 'Only declared fixture requests are allowed');
      if (response instanceof Error) throw response;
      return response;
    }, now: () => clock, wait: async milliseconds => { clock += milliseconds; waits.push(milliseconds); },
  };
  return { calls, waits, transport };
}

for (const role of ['patient', 'student', 'lecturer', 'staff', 'doctor', 'receptionist']) {
  test(`${role} uses only Brevo with its trusted recipient and stable challenge key`, async () => {
    const transport = fixture();
    const identity = { ...patient, role };
    assert.deepEqual(selectOtpEmailDelivery(identity, settings), {provider: 'brevo', senderFrom: settings.BREVO_FROM_EMAIL});
    const result = await sendOtpEmail(email, '123456', challengeId, settings, 300, transport.transport, identity);
    assert.equal(result.messageId, messageId);
    assert.equal(transport.calls.length, 1);
    const { url, init } = transport.calls[0];
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('api-key'), settings.BREVO_API_KEY);
    assert.equal(headers.get('authorization'), null);
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.sender, {email: 'sender.fixture@gmail.com', name: 'SCCPMS'});
    assert.deepEqual(body.to, [{email}]);
    assert.deepEqual(body.headers, {idempotencyKey: challengeId});
    assert.match(body.htmlContent, /123456/);
    assert.match(body.htmlContent, /5 minutes/);
    assert.equal(body.textContent, undefined, 'Brevo accepts one content variant per message');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    assert.ok(!JSON.stringify(result).includes('123456'));
  });
}

test('non-admins cannot force Resend, another sender, another recipient or a missing Brevo configuration', async () => {
  for (const [changes, authorization, destination] of [
    [{}, {...patient, provider: 'resend'}, email],
    [{}, {...patient, senderFrom: 'SCCPMS <onboarding@resend.dev>'}, email],
    [{}, {...patient, senderFrom: 'Other <other@gmail.com>'}, email],
    [{}, patient, 'other@gmail.com'],
    [{BREVO_API_KEY: ''}, patient, email],
    [{BREVO_FROM_EMAIL: ''}, patient, email],
    [{BREVO_API_KEY: 'xsmtpsib-test_' + 'a'.repeat(40)}, patient, email],
  ] as const) {
    const transport = fixture();
    await assert.rejects(sendOtpEmail(destination, '123456', challengeId, {...settings, ...changes}, 600, transport.transport, authorization), {reason: 'configuration'});
    assert.equal(transport.calls.length, 0);
  }
});

test('an unbound administrator cannot fall back to Brevo', async () => {
  const transport = fixture();
  await assert.rejects(sendOtpEmail(email, '123456', challengeId, settings, 600, transport.transport, {...patient, role: 'admin'}), {reason: 'configuration'});
  assert.equal(transport.calls.length, 0);
});

for (const [status, payload, reason, outcome] of [
  [401, {code: 'unauthorized', message: 'We have detected you are using an unrecognised IP address 192.0.2.1'}, 'ip_authorization', 'not_sent'],
  [401, {code: 'unauthorized', message: 'Invalid API key'}, 'authentication', 'not_sent'],
  [400, {code: 'invalid_parameter', message: 'sender is not verified'}, 'sender_unverified', 'not_sent'],
  [402, {code: 'not_enough_credits'}, 'quota_exceeded', 'not_sent'],
  [400, {code: 'duplicate_parameter', message: 'Duplicate idempotency key'}, 'duplicate_request', 'unknown'],
] as const) test(`Brevo ${reason} is safe, bounded and does not become a false acknowledgement`, async () => {
  const transport = fixture([Response.json(payload, {status})]);
  await assert.rejects(sendOtpEmail(email, '123456', challengeId, settings, 600, transport.transport, patient), (error: unknown) => {
    assert.ok(error instanceof EmailDeliveryError);
    assert.equal(error.reason, reason);
    assert.equal(error.deliveryOutcome, outcome);
    assert.ok(!error.message.includes('192.0.2.1'));
    assert.ok(!error.message.includes(settings.BREVO_API_KEY!));
    return true;
  });
  assert.equal(transport.calls.length, 1);
});

test('Brevo retries a lost response with the exact same code, sender and idempotency key', async () => {
  const transport = fixture([new TypeError('Synthetic lost response'), Response.json({messageId})]);
  await sendOtpEmail(email, '123456', challengeId, settings, 600, transport.transport, patient);
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[0].init.body, transport.calls[1].init.body);
  assert.deepEqual(transport.waits, [500]);
});

test('Brevo requires a message reference before accepting delivery', async () => {
  for (const payload of [{}, {messageId: ''}, {messageId: 'not-a-provider-reference'}, {messageId: '<bad\r\nreference@relay.test>'}]) {
    const transport = fixture([Response.json(payload)]);
    await assert.rejects(sendOtpEmail(email, '123456', challengeId, settings, 600, {...transport.transport, timeoutMs: 100}, patient), {reason:'invalid_response', deliveryOutcome:'unknown'});
    assert.equal(transport.calls.length, 1);
  }
});

test('production accepts verified individual-sender configuration and preserves owner-only startup while Brevo is pending', () => {
  const base = {...config, NODE_ENV:'production', FRONTEND_ORIGIN:'https://clinic.fixture.co.za', DATABASE_SSL_MODE:'verify-full', ...settings};
  assert.equal(configSchema.safeParse(base).success, true);
  assert.equal(configSchema.safeParse({...base, BREVO_FROM_EMAIL:''}).success, true);
  assert.equal(configSchema.safeParse({...base, RESEND_ADMIN_OWNER_EMAIL:'', RESEND_ADMIN_OWNER_USER_ID:'', RESEND_API_KEY:''}).success, true);
  for (const changes of [{BREVO_API_KEY:'xsmtpsib-test_'+'a'.repeat(40)}, {BREVO_FROM_EMAIL:'Clinic <sender@fixture.invalid>'}, {BREVO_FROM_EMAIL:'sender@gmail.com\r\nBcc: other@gmail.com'}]) {
    assert.equal(configSchema.safeParse({...base,...changes}).success, false);
  }
});
