import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import otp from '../src/otp.routes.js';
import { pool } from '../src/db.js';
import { sendOtpEmail } from '../src/email.js';
import { otpCodeHash, otpEmailHash } from '../src/otp-security.js';

afterEach(() => mock.restoreAll());
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const email = 'patient@spu.ac.za';
const emailHash = otpEmailHash(userId, email)!;
const hash = otpCodeHash(userId, sessionId, emailHash, '123456').toString('hex');
async function verify(challenge: object | null, code = '123456') {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  mock.method(pool, 'connect', async () => ({
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      return {
        rows: sql.includes('SELECT id, code_hash') && challenge ? [challenge] : [],
        rowCount: challenge ? 1 : 0,
      };
    },
    release() {},
  }));
  const result = { status: 200, body: undefined as any };
  const res = {
    status(status: number) {
      result.status = status;
      return res;
    },
    json(body: unknown) {
      result.body = body;
      return res;
    },
  };
  const route = otp.stack
    .find((layer: any) => layer.route?.path === '/verify')
    .route.stack.at(-1).handle;
  await route(
    { auth: { userId, sessionId, email }, body: { code } } as unknown as Request,
    res as unknown as Response
  );
  return { ...result, queries };
}
test('correct OTP creates only the authenticated database verification session and consumes the challenge', async () => {
  const result = await verify({ id: userId, code_hash: hash, attempts: 0, expired: false });
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.queries.find((query) => query.sql.includes('INSERT INTO otp_verified_sessions'))?.values,
    [userId, sessionId, emailHash]
  );
  const selection = result.queries.find(query => query.sql.includes('SELECT id, code_hash'))!;
  assert.deepEqual(selection.values, [userId, sessionId, emailHash]);
  assert.match(selection.sql, /email_hash = \$3/);
  assert.match(selection.sql, /delivery_state = 'accepted'/);
  assert.match(selection.sql, /FOR UPDATE/);
  assert.ok(result.queries.some((query) => query.sql.includes('consumed_at = now()')));
  assert.equal(result.queries.at(-1)?.sql, 'COMMIT');
});
test('wrong OTP records an attempt without granting dashboard access', async () => {
  const result = await verify(
    { id: userId, code_hash: hash, attempts: 0, expired: false },
    '654321'
  );
  assert.equal(result.status, 401);
  assert.ok(result.queries.some((query) => query.sql.includes('attempts = attempts + 1')));
  assert.ok(
    !result.queries.some((query) => query.sql.includes('INSERT INTO otp_verified_sessions'))
  );
});
for (const [name, challenge, status] of [
  ['missing', null, 404],
  ['expired', { id: userId, code_hash: hash, attempts: 0, expired: true }, 410],
  ['exhausted', { id: userId, code_hash: hash, attempts: 5, expired: false }, 429],
] as const)
  test(`${name} OTP challenge cannot authenticate`, async () => {
    const result = await verify(challenge);
    assert.equal(result.status, status);
    assert.ok(
      !result.queries.some((query) => query.sql.includes('INSERT INTO otp_verified_sessions'))
    );
  });
test('malformed email OTP input is rejected before opening a database transaction', async () => {
  for (const code of ['12345', '1234567', 'abcdef', '123 456']) {
    const result = await verify(null, code);
    assert.equal(result.status, 400);
    assert.equal(result.queries.length, 0);
  }
});
test('email OTP uses Resend with the authenticated email and challenge idempotency key', async () => {
  let accepted = true;
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Idempotency-Key'), `otp/${userId}`);
    assert.equal(headers.get('Authorization'), 'Bearer re_test_fixture_only_0123456789');
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload.to, [email]);
    assert.match(payload.text, /123456/);
    return new globalThis.Response(
      JSON.stringify(accepted ? { id: sessionId } : { message: 'Rejected fixture' }),
      { status: accepted ? 200 : 422 }
    );
  });
  const settings = { NODE_ENV: 'production' as const, RESEND_API_KEY: 're_test_fixture_only_0123456789', RESEND_FROM_EMAIL: '', RESEND_ADMIN_OWNER_EMAIL: email, RESEND_ADMIN_OWNER_USER_ID: userId };
  const owner = { userId, role: 'admin', email };
  await sendOtpEmail(email, '123456', userId, settings, 600, {}, owner);
  accepted = false;
  await assert.rejects(sendOtpEmail(email, '123456', userId, settings, 600, {}, owner));
});
