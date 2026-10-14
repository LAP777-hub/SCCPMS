import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OWNER_OTP_SENDER, selectOtpEmailSender, sendOtpEmail,
  type EmailSettings, type EmailTransport, type OtpEmailAuthorization,
} from '../src/email.js';

const ownerId = '00000000-0000-4000-8000-000000000031';
const otherId = '00000000-0000-4000-8000-000000000032';
const challengeId = '00000000-0000-4000-8000-000000000033';
const messageId = '00000000-0000-4000-8000-000000000034';
const ownerEmail = 'owner.fixture@gmail.com';
const primarySender = 'SCCPMS <login@verified-fixture.co.za>';
const primary: EmailSettings = { NODE_ENV: 'production', RESEND_API_KEY: 're_owner_fixture_only_0123456789', RESEND_FROM_EMAIL: primarySender };
const configured: EmailSettings = { ...primary, RESEND_ADMIN_OWNER_EMAIL: ownerEmail, RESEND_ADMIN_OWNER_USER_ID: ownerId };
const owner: OtpEmailAuthorization = { userId: ownerId, role: 'admin', email: ownerEmail };

function provider(responses: Array<Response | Error> = [Response.json({ id: messageId })]) {
  let now = 0;
  const calls: Array<{ input: string; init: RequestInit }> = [];
  const waits: number[] = [];
  return { calls, waits, transport: {
    async fetcher(input, init) {
      calls.push({ input: String(input), init: init! });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, 'fixture only permits the explicitly declared provider calls');
      return response;
    },
    now: () => now,
    wait: async milliseconds => { waits.push(milliseconds); now += milliseconds; },
  } satisfies Partial<EmailTransport> };
}

test('the owner sender is off by default and requires a complete valid configuration', () => {
  for (const settings of [
    primary,
    { ...configured, RESEND_ADMIN_OWNER_EMAIL: '' },
    { ...configured, RESEND_ADMIN_OWNER_USER_ID: '' },
    { ...configured, RESEND_ADMIN_OWNER_EMAIL: 'invalid' },
    { ...configured, RESEND_ADMIN_OWNER_USER_ID: 'invalid' },
  ]) assert.equal(selectOtpEmailSender(owner, settings), primarySender);
});

test('only the exact configured admin UUID and normalized email select the fixed owner sender', () => {
  assert.equal(selectOtpEmailSender(owner, configured), OWNER_OTP_SENDER);
  assert.equal(selectOtpEmailSender({ ...owner, email: ' OWNER.FIXTURE@GMAIL.COM ' }, { ...configured, RESEND_ADMIN_OWNER_EMAIL: ' Owner.Fixture@Gmail.Com ' }), OWNER_OTP_SENDER);
  for (const context of [
    { ...owner, userId: otherId },
    { ...owner, email: 'other@gmail.com' },
    { ...owner, email: 'owner.fixture+alias@gmail.com' },
    { ...owner, role: 'doctor' },
    { ...owner, role: 'receptionist' },
    { ...owner, role: 'patient' },
    { ...owner, role: 'student' },
    { ...owner, role: 'ADMIN' },
  ]) assert.equal(selectOtpEmailSender(context, configured), primarySender);
});

test('a fully authorized owner uses the real Resend request and acknowledged response in production', async () => {
  const fixture = provider();
  const delivered = await sendOtpEmail(ownerEmail, '123456', challengeId, configured, 600, fixture.transport, owner);
  assert.equal(delivered.messageId, messageId);
  assert.equal(delivered.deliveryMode, 'email');
  assert.equal(fixture.calls.length, 1);
  const { input, init } = fixture.calls[0];
  assert.equal(input, 'https://api.resend.com/emails');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal);
  const body = JSON.parse(String(init.body));
  assert.equal(body.from, OWNER_OTP_SENDER);
  assert.deepEqual(body.to, [ownerEmail]);
  assert.match(body.text, /123456/);
  assert.match(body.text, /10 minutes/);
  assert.equal(new Headers(init.headers).get('Idempotency-Key'), `otp/${challengeId}`);
  assert.ok(!JSON.stringify(delivered).includes('123456'));
});

test('a configured owner without authorization context still uses only the primary sender', async () => {
  const fixture = provider();
  await sendOtpEmail(ownerEmail, '123456', challengeId, configured, 600, fixture.transport);
  assert.equal(JSON.parse(String(fixture.calls[0].init.body)).from, primarySender);
});

for (const [name, context, destination] of [
  ['another user UUID', { ...owner, userId: otherId }, ownerEmail],
  ['another admin email', { ...owner, email: 'other@gmail.com' }, ownerEmail],
  ['another recipient', owner, 'other@gmail.com'],
  ['an email alias', owner, 'owner.fixture+alias@gmail.com'],
  ['doctor role', { ...owner, role: 'doctor' }, ownerEmail],
  ['receptionist role', { ...owner, role: 'receptionist' }, ownerEmail],
  ['patient role', { ...owner, role: 'patient' }, ownerEmail],
] as const) test(`a stored owner sender cannot authorize ${name}`, async () => {
  const fixture = provider();
  await assert.rejects(sendOtpEmail(destination, '123456', challengeId, configured, 600, fixture.transport, { ...context, senderFrom: OWNER_OTP_SENDER }), { reason: 'configuration' });
  assert.equal(fixture.calls.length, 0);
});

test('missing owner configuration and no context cannot admit a production test sender', async () => {
  for (const settings of [
    { ...primary, RESEND_FROM_EMAIL: OWNER_OTP_SENDER },
    { ...configured, RESEND_FROM_EMAIL: OWNER_OTP_SENDER },
  ]) {
    const fixture = provider();
    await assert.rejects(sendOtpEmail(ownerEmail, '123456', challengeId, settings, 600, fixture.transport), { reason: 'configuration' });
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = provider();
  await assert.rejects(sendOtpEmail(ownerEmail, '123456', challengeId, primary, 600, fixture.transport, { ...owner, senderFrom: OWNER_OTP_SENDER }), { reason: 'configuration' });
  assert.equal(fixture.calls.length, 0);
});

for (const senderFrom of [
  'onboarding@resend.dev', 'SCCPMS <other@resend.dev>', 'SCCPMS <onboarding@sub.resend.dev>',
  'SCCPMS <login@fixture.invalid>', 'SCCPMS <onboarding@resend.dev>\r\nBcc: other@gmail.com',
]) test(`the authorized owner cannot replace the exact exception with ${JSON.stringify(senderFrom)}`, async () => {
  const fixture = provider();
  await assert.rejects(sendOtpEmail(ownerEmail, '123456', challengeId, configured, 600, fixture.transport, { ...owner, senderFrom }), { reason: 'configuration' });
  assert.equal(fixture.calls.length, 0);
});

test('owner provider retries preserve the stored sender, code, duration and idempotency key', async () => {
  const fixture = provider([new TypeError('Synthetic response loss'), Response.json({ id: messageId })]);
  await sendOtpEmail(ownerEmail, '123456', challengeId, { ...configured, OTP_VALIDITY_SECONDS: 900 }, 600, fixture.transport, { ...owner, senderFrom: OWNER_OTP_SENDER });
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].init.body, fixture.calls[1].init.body);
  for (const { init } of fixture.calls) {
    assert.equal(JSON.parse(String(init.body)).from, OWNER_OTP_SENDER);
    assert.match(JSON.parse(String(init.body)).text, /10 minutes/);
    assert.equal(new Headers(init.headers).get('Idempotency-Key'), `otp/${challengeId}`);
  }
  assert.deepEqual(fixture.waits, [500]);
});

test('stored normal senders remain stable when the primary configuration changes', async () => {
  const fixture = provider();
  await sendOtpEmail('patient@gmail.com', '123456', challengeId, { ...configured, RESEND_FROM_EMAIL: 'SCCPMS <login@new-verified-fixture.co.za>' }, 600, fixture.transport, {
    userId: otherId, role: 'patient', email: 'patient@gmail.com', senderFrom: primarySender,
  });
  assert.equal(JSON.parse(String(fixture.calls[0].init.body)).from, primarySender);
});

test('legacy development and test transport fixtures can still use their configured test sender', async () => {
  for (const NODE_ENV of ['development', 'test'] as const) {
    const fixture = provider();
    await sendOtpEmail(ownerEmail, '123456', challengeId, { ...primary, NODE_ENV, RESEND_FROM_EMAIL: 'onboarding@resend.dev' }, 600, fixture.transport);
    assert.equal(JSON.parse(String(fixture.calls[0].init.body)).from, 'onboarding@resend.dev');
  }
});
