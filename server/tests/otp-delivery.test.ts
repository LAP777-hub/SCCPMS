import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import otp, { getOtpStatus } from '../src/otp.routes.js';
import { requireOtp } from '../src/auth.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { OWNER_OTP_SENDER, EmailDeliveryError } from '../src/email.js';
import { sendOwnerFixture as sendOtpEmail } from './email-fixtures.js';
import { otpCodeHash, otpEmailHash } from '../src/otp-security.js';
import { maskEmailAddress, normalizeEmailAddress, senderEmailAddress } from '../src/email-address.js';

const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const messageId = '00000000-0000-4000-8000-000000000003';
const email = 'patient@spu.ac.za';
const liveSettings = {
  NODE_ENV: 'production' as const,
  RESEND_API_KEY: 're_test_fixture_only_0123456789',
  RESEND_FROM_EMAIL: OWNER_OTP_SENDER,
  RESEND_ADMIN_OWNER_EMAIL: email, RESEND_ADMIN_OWNER_USER_ID: userId,
};
let originalSettings: typeof config;
beforeEach(() => {
  originalSettings = { ...config };
  // Routes also use synthetic credentials; fetch is mocked for every provider call.
  Object.assign(config, liveSettings);
});
afterEach(() => { Object.assign(config, originalSettings); mock.restoreAll(); });

function provider(payload: unknown = { id: messageId }, status = 200) {
  return mock.method(globalThis, 'fetch', async () => new globalThis.Response(JSON.stringify(payload), { status }));
}
function response() {
  const result = { status: 200, body: undefined as any };
  const res = { status(value: number) { result.status = value; return res; }, json(body: unknown) { result.body = body; return res; } };
  return { result, res: res as unknown as Response };
}
const request = (destination = email, phone = '+27123456789', activeSession = sessionId) =>
  ({ auth: { userId, sessionId: activeSession, email: destination, phone, role: 'admin' }, body: { code: '123456' } }) as unknown as Request;
const handler = (path: string) => otp.stack.find((layer: any) => layer.route?.path === path).route.stack.at(-1).handle;

test('email OTP uses Resend and retains its accepted message reference', async () => {
  const fetch = provider();
  const accepted = await sendOtpEmail(email, '123456', userId, liveSettings);
  assert.equal(fetch.mock.calls[0].arguments[0], 'https://api.resend.com/emails');
  assert.equal(accepted.deliveryMode, 'email');
  assert.equal(accepted.messageId, messageId);
  const init = fetch.mock.calls[0].arguments[1] as RequestInit;
  const headers = new Headers(init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer ' + liveSettings.RESEND_API_KEY);
  assert.equal(headers.get('Idempotency-Key'), 'otp/' + userId);
  const payload = JSON.parse(String(init.body));
  assert.deepEqual(payload.to, [email]);
  assert.equal(payload.from, liveSettings.RESEND_FROM_EMAIL);
  assert.match(payload.text, /123456/);
  assert.match(payload.text, /5 minutes/i);
  assert.ok(!JSON.stringify(accepted).includes('123456'));
});
for (const [name, payload] of [
  ['missing provider reference', {}],
  ['null provider reference', { id: null }],
  ['malformed provider reference', { id: 'not-a-uuid' }],
  ['array response', [{ id: messageId }]],
  ['null response', null],
] as const) test('email provider rejects ' + name, async () => {
  provider(payload);
  await assert.rejects(sendOtpEmail(email, '123456', userId, liveSettings), { reason: 'invalid_response' });
});
for (const [status, reason] of [[401, 'authentication'], [403, 'provider_rejected'], [422, 'provider_rejected'], [429, 'rate_limited'], [503, 'provider_rejected']] as const) {
  test('email provider HTTP ' + status + ' produces a safe ' + reason + ' error', async () => {
    provider({ message: 'private provider details' }, status);
    await assert.rejects(sendOtpEmail(email, '123456', userId, liveSettings),
      (error: unknown) => error instanceof EmailDeliveryError && error.reason === reason && !error.message.includes('private'));
  });
}
test('missing credentials, test sender and malformed email fail before any provider call', async () => {
  const fetch = provider();
  await assert.rejects(sendOtpEmail(email, '123456', userId, { ...liveSettings, RESEND_API_KEY: '' }), { reason: 'configuration' });
  await assert.rejects(sendOtpEmail(email, '123456', userId, { ...liveSettings, RESEND_FROM_EMAIL: 'onboarding@resend.dev' }), { reason: 'configuration' });
  await assert.rejects(sendOtpEmail('invalid-email', '123456', userId, liveSettings), { reason: 'invalid_email' });
  await assert.rejects(sendOtpEmail(email + ',attacker@example.invalid', '123456', userId, liveSettings), { reason: 'invalid_email' });
  await assert.rejects(sendOtpEmail(email, '123456', '-'.repeat(36), liveSettings), { reason: 'configuration' });
  for (const domain of ['sub.resend.dev', 'clinic.invalid', 'clinic.example', 'clinic.test']) {
    await assert.rejects(sendOtpEmail(email, '123456', userId, { ...liveSettings, RESEND_FROM_EMAIL: `Clinic <login@${domain}>` }), { reason: 'configuration' });
  }
  await assert.rejects(sendOtpEmail(email, '123456', userId, { ...liveSettings, RESEND_FROM_EMAIL: 'Clinic <login@spu.ac.za>\r\nBcc: attacker@spu.ac.za' }), { reason: 'configuration' });
  assert.equal(fetch.mock.calls.length, 0);
});
test('email normalization and masking preserve one destination and reject injected sender headers', () => {
  assert.equal(normalizeEmailAddress(' Patient@SPU.AC.ZA '), email);
  assert.equal(normalizeEmailAddress('patient@spu.ac.za,attacker@spu.ac.za'), null);
  assert.equal(senderEmailAddress('Clinic <Login@CLINIC.SPU.AC.ZA>'), 'login@clinic.spu.ac.za');
  assert.equal(senderEmailAddress('Clinic <login@spu.ac.za>\nBcc: attacker@spu.ac.za'), null);
  assert.equal(maskEmailAddress(email), 'p***@spu.ac.za');
});
for (const [name, error, reason] of [
  ['timeout', new DOMException('unsafe provider details', 'TimeoutError'), 'timeout'],
  ['network failure', new TypeError('unsafe provider details'), 'network'],
] as const) test('provider ' + name + ' does not leak its request, destination, key or code', async () => {
  mock.method(globalThis, 'fetch', async () => { throw error; });
  await assert.rejects(sendOtpEmail(email, '123456', userId, liveSettings),
    (failure: unknown) => failure instanceof EmailDeliveryError && failure.reason === reason
      && ![email, '123456', liveSettings.RESEND_API_KEY, 'unsafe'].some(value => failure.message.includes(value)));
});

async function sendFixture(cooldown: boolean, hourlyCount = 0) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  mock.method(pool, 'connect', async () => ({
    query: async (sql: string, values?: unknown[]) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT policy.*')) return { rows: [{ hourly_count: hourlyCount, retry_after_seconds: cooldown ? 30 : 0, id: null }], rowCount: 1 };
      if (sql.includes('SELECT delivery_state')) return { rows: [{ delivery_state: 'pending', consumed_at: null, accepted_at: null, validity_seconds: config.OTP_VALIDITY_SECONDS, expires_at: new Date(), too_old: false }], rowCount: 1 };
      return { rows: [{ id: userId }], rowCount: 1 };
    }, release() {},
  }));
  mock.method(pool, 'query', async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values });
    return { rows: sql.includes('AS verified') ? [{ verified: false, active_expires_at: null, retry_after_seconds: cooldown ? 30 : 0 }] : [], rowCount: 1 };
  });
  const fetch = provider();
  const { result, res } = response();
  const req = request();
  req.body = { email: 'attacker@example.invalid' };
  await handler('/send')(req, res);
  return { result, statements, fetch };
}
test('resend cooldown applies across login sessions and sends no second email', async () => {
  const { result, statements, fetch } = await sendFixture(true);
  assert.equal(result.status, 429);
  const check = statements.find(item => item.sql.includes('SELECT policy.*'))!;
  assert.equal(check.values?.[0], userId);
  assert.match(check.sql, /FROM otp_challenges WHERE user_id = \$1 AND sent_at/);
  assert.equal(result.body.retryAfterSeconds, 30);
  assert.equal(fetch.mock.calls.length, 0);
});
test('persisted hourly email cap prevents repeated sends despite new sessions or server restart', async () => {
  const { result, fetch } = await sendFixture(false, 10);
  assert.equal(result.status, 429);
  assert.equal(fetch.mock.calls.length, 0);
});
test('OTP send saves its email binding and accepted reference and ignores a recipient override', async () => {
  const { result, statements, fetch } = await sendFixture(false);
  assert.equal(result.status, 202);
  assert.equal(result.body.deliveryMode, 'email');
  assert.equal(statements.find(item => item.sql.includes('INSERT INTO otp_challenges'))?.values?.[4], otpEmailHash(userId, email));
  assert.ok(statements.some(item => item.sql.includes("delivery_state = 'accepted'")));
  assert.ok(statements.some(item => item.sql.includes('auth.otp_requested')));
  const payload = JSON.parse(String((fetch.mock.calls[0].arguments[1] as RequestInit).body));
  assert.deepEqual(payload.to, [email]);
  const sentCode = String(payload.text).match(/\b[0-9]{6}\b/)?.[0];
  assert.ok(sentCode);
  const savedCode = statements.find(item => item.sql.includes('INSERT INTO otp_challenges'))?.values?.[3];
  assert.match(String(savedCode), /^[a-f0-9]{64}$/);
  assert.notEqual(savedCode, sentCode);
  assert.ok(!JSON.stringify(result.body).includes(sentCode));
  assert.ok(!JSON.stringify(result.body).includes('attacker'));
  assert.equal(result.body.expiresInSeconds, 300);
  assert.equal(result.body.retryAfterSeconds, 30);
  assert.ok(Date.parse(result.body.expiresAt) > Date.now());
});
test('missing email configuration returns an actionable safe unavailable response', async () => {
  Object.assign(config, { RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' });
  const { result, fetch } = await sendFixture(false);
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'Email verification is not configured. Contact the clinic administrator.');
  assert.equal(fetch.mock.calls.length, 0);
});
test('database connection failures return a safe unavailable response for send and verify', async () => {
  mock.method(pool, 'connect', async () => { throw new Error('private database details'); });
  for (const path of ['/send', '/verify']) {
    const { result, res } = response();
    await handler(path)(request(), res);
    assert.equal(result.status, 503);
    assert.ok(!JSON.stringify(result.body).includes('private'));
  }
});
test('provider rejection remains safe when failed-challenge cleanup also loses the database', async () => {
  mock.method(pool, 'connect', async () => ({ query: async (sql: string) => ({ rows: sql.includes('SELECT policy.*') ? [{ hourly_count: 0, retry_after_seconds: 0, id: null }] : [], rowCount: 1 }), release() {} }));
  mock.method(pool, 'query', async () => { throw new Error('private connection failure'); });
  provider({ message: 'Rejected fixture' }, 422);
  const { result, res } = response();
  await handler('/send')(request(), res);
  assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result.body).includes('private'));
});
test('an old email verification cannot restore or authorize a changed email', async () => {
  const oldBinding = otpEmailHash(userId, email);
  mock.method(pool, 'query', async (_sql: string, values: unknown[]) => ({ rows: [{ verified: values[2] === oldBinding, active_expires_at: null, retry_after_seconds: 0 }], rowCount: values[2] === oldBinding ? 1 : 0 }));
  const req = request('other@spu.ac.za');
  const { result, res } = response();
  await getOtpStatus(req, res);
  assert.equal(result.body.verified, false);
  const next = mock.fn();
  await requireOtp(req, res, next);
  assert.equal(result.status, 428);
  assert.equal(next.mock.calls.length, 0);
});
test('a phone-only change leaves email OTP restoration and authorization valid', async () => {
  const binding = otpEmailHash(userId, email);
  mock.method(pool, 'query', async (_sql: string, values: unknown[]) => ({ rows: [{ verified: values[2] === binding, active_expires_at: null, retry_after_seconds: 0 }], rowCount: values[2] === binding ? 1 : 0 }));
  const req = request(email, '+27999999999');
  const { result, res } = response();
  await getOtpStatus(req, res);
  assert.equal(result.body.verified, true);
  const next = mock.fn();
  await requireOtp(req, res, next);
  assert.equal(next.mock.calls.length, 1);
});
test('OTP hashes bind the account, auth session and normalized email destination', () => {
  const binding = otpEmailHash(userId, email)!;
  const hash = otpCodeHash(userId, sessionId, binding, '123456').toString('hex');
  assert.equal(binding, otpEmailHash(userId, ' PATIENT@SPU.AC.ZA '));
  assert.notEqual(hash, otpCodeHash(userId, sessionId, otpEmailHash(userId, 'other@spu.ac.za')!, '123456').toString('hex'));
  assert.notEqual(hash, otpCodeHash(userId, 'other-session', binding, '123456').toString('hex'));
  assert.notEqual(hash, otpCodeHash('other-user', sessionId, binding, '123456').toString('hex'));
  assert.equal(otpEmailHash(userId, 'not-an-email'), null);
  assert.ok(otpEmailHash(userId, 'admin.personal@example.invalid'));
});
test('concurrent requests from two sessions share the account lock and send only one email', async () => {
  let turn = Promise.resolve();
  let challengeCreated = false;
  mock.method(pool, 'connect', async () => {
    let unlock: (() => void) | undefined;
    return {
      async query(sql: string, values?: unknown[]) {
        if (sql.includes('pg_advisory_xact_lock')) {
          assert.deepEqual(values, ['otp-send:' + userId]);
          const previous = turn;
          turn = new Promise<void>(resolve => { unlock = resolve; });
          await previous;
        }
        if (sql.includes('SELECT policy.*')) return { rows: [{ hourly_count: challengeCreated ? 1 : 0, retry_after_seconds: challengeCreated ? 30 : 0, id: null }], rowCount: 1 };
        if (sql.includes('SELECT delivery_state')) return { rows: [{ delivery_state: 'pending', consumed_at: null, accepted_at: null, validity_seconds: 600, expires_at: new Date(), too_old: false }], rowCount: 1 };
        if (sql.includes('INSERT INTO otp_challenges')) challengeCreated = true;
        if (['COMMIT', 'ROLLBACK'].includes(sql)) unlock?.();
        return { rows: [{ id: userId }], rowCount: 1 };
      },
      release() { unlock?.(); },
    };
  });
  mock.method(pool, 'query', async () => ({ rows: [{ verified: false, active_expires_at: null, retry_after_seconds: 30 }], rowCount: 1 }));
  const fetch = provider();
  const first = response(), second = response();
  await Promise.all([
    handler('/send')(request(), first.res),
    handler('/send')(request(email, '+27123456789', messageId), second.res),
  ]);
  assert.deepEqual([first.result.status, second.result.status].sort(), [202, 429]);
  assert.equal(fetch.mock.calls.length, 1);
});
