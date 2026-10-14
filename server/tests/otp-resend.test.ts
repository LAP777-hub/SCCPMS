import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { Request, Response } from 'express';
import otp, { getOtpStatus } from '../src/otp.routes.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { otpCodeHash, otpEmailHash } from '../src/otp-security.js';

const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const messageId = '00000000-0000-4000-8000-000000000003';
const email = 'patient@spu.ac.za';
const emailHash = otpEmailHash(userId, email)!;
let originalSettings: Pick<typeof config, 'NODE_ENV' | 'RESEND_API_KEY' | 'RESEND_FROM_EMAIL' | 'OTP_VALIDITY_SECONDS' | 'OTP_RESEND_COOLDOWN_SECONDS'>;
beforeEach(() => {
  originalSettings = { NODE_ENV: config.NODE_ENV, RESEND_API_KEY: config.RESEND_API_KEY, RESEND_FROM_EMAIL: config.RESEND_FROM_EMAIL, OTP_VALIDITY_SECONDS: config.OTP_VALIDITY_SECONDS, OTP_RESEND_COOLDOWN_SECONDS: config.OTP_RESEND_COOLDOWN_SECONDS };
  Object.assign(config, { NODE_ENV: 'production', RESEND_API_KEY: 're_test_fixture_only_0123456789', RESEND_FROM_EMAIL: 'SCCPMS Clinic <clinic@notifications.sccpms-fixture.co.za>', OTP_VALIDITY_SECONDS: 600, OTP_RESEND_COOLDOWN_SECONDS: 30 });
});
afterEach(() => { Object.assign(config, originalSettings); mock.restoreAll(); });

function response() {
  const result = { status: 200, body: undefined as any, writes: 0 };
  const res = {
    headersSent: false, writableEnded: false,
    status(value: number) { assert.ok(!res.headersSent && !res.writableEnded, 'ERR_HTTP_HEADERS_SENT'); result.status = value; return res; },
    json(body: unknown) { assert.ok(!res.headersSent && !res.writableEnded, 'ERR_HTTP_HEADERS_SENT'); result.body = body; result.writes++; return res; },
  };
  return { result, res: res as unknown as Response, close() { res.headersSent = true; res.writableEnded = true; } };
}
const request = () => ({ auth: { userId, sessionId, email }, body: {} }) as unknown as Request;
const send = otp.stack.find((layer: any) => layer.route?.path === '/send').route.stack.at(-1).handle;

function fixture(failAuditOnce = false) {
  type Draft = { id: string; delivery_state: string; consumed_at: Date | null; accepted_at: Date | null; expires_at: Date; validity_seconds: number; provider_message_id: string | null; code_hash: string; too_old: boolean };
  let draft: Draft | null = null;
  let audits = 0, oldConsumed = false;
  const hooks = { afterCommit: undefined as (() => void) | undefined };
  const originalExpiry = new Date(Date.now() + 240000);
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  mock.method(pool, 'connect', async () => ({
    async query(sql: string, values?: unknown[]) {
      statements.push({ sql, values });
      if (sql.includes('SELECT policy.*')) return { rows: [{ hourly_count: draft ? 2 : 1, retry_after_seconds: 0,
        id: draft?.delivery_state === 'pending' && !draft.consumed_at ? draft.id : null,
        validity_seconds: draft?.validity_seconds, provider_message_id: draft?.provider_message_id, accepted_at: draft?.accepted_at,
      }], rowCount: 1 };
      if (sql.includes('INSERT INTO otp_challenges')) draft = {
        id: String(values?.[0]), code_hash: String(values?.[3]), delivery_state: 'pending', consumed_at: null,
        validity_seconds: Number(values?.[5]), accepted_at: null, provider_message_id: null, expires_at: new Date(), too_old: false,
      };
      if (sql.includes('SELECT delivery_state')) return { rows: draft ? [draft] : [], rowCount: draft ? 1 : 0 };
      if (sql.includes('auth.otp_requested')) {
        if (failAuditOnce) { failAuditOnce = false; throw new Error('private audit fixture failure'); }
        assert.ok(draft);
        draft.delivery_state = 'accepted';
        draft.accepted_at = values?.[2] as Date;
        draft.expires_at = values?.[3] as Date;
        draft.provider_message_id = String(values?.[1]);
        oldConsumed = true;
        audits++;
      }
      if (sql === 'COMMIT' && hooks.afterCommit) { const complete = hooks.afterCommit; hooks.afterCommit = undefined; complete(); }
      return { rows: [], rowCount: 1 };
    }, release() {},
  }));
  mock.method(pool, 'query', async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values });
    if (sql.includes('AS verified')) return { rows: [{ verified: false,
      active_expires_at: draft?.delivery_state === 'accepted' && !draft.consumed_at ? draft.expires_at : oldConsumed ? null : originalExpiry,
      retry_after_seconds: 0,
    }], rowCount: 1 };
    if (sql.includes('WITH failed AS') && draft?.delivery_state === 'pending' && !draft.consumed_at && !draft.provider_message_id) {
      if (values?.[1]) { draft.delivery_state = 'failed'; draft.consumed_at = new Date(); }
    }
    if (sql.includes('SET provider_message_id = COALESCE') && draft?.delivery_state === 'pending' && !draft.consumed_at) {
      draft.provider_message_id ??= String(values?.[1]);
      draft.accepted_at ??= values?.[2] as Date;
    }
    return { rows: [], rowCount: 1 };
  });
  return { statements, originalExpiry, hooks, get draft() { return draft; }, get audits() { return audits; }, get oldConsumed() { return oldConsumed; } };
}

test('a rejected sender preserves the old accepted code and offers a short, safe retry', async () => {
  const database = fixture();
  mock.method(globalThis, 'fetch', async () => new globalThis.Response(JSON.stringify({ name: 'validation_error', message: 'The fixture domain is not verified. Private provider details.' }), { status: 403 }));
  const { result, res } = response();
  await send(request(), res);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'OTP_EMAIL_UNAVAILABLE');
  assert.match(result.body.error, /clinic administrator/);
  assert.equal(result.body.retryAfterSeconds, 2);
  assert.equal(result.body.activeChallenge.expiresAt, database.originalExpiry.toISOString());
  assert.equal(database.oldConsumed, false);
  assert.equal(database.draft?.delivery_state, 'failed');
  assert.ok(!JSON.stringify(result.body).includes('Private'));
  assert.ok(!database.statements.some(item => item.sql.includes('auth.otp_requested')));
});

test('an ambiguous delivery retry reuses the same destination, code, idempotency key and original duration', async () => {
  const database = fixture();
  let reject = true;
  const provider = mock.method(globalThis, 'fetch', async () => new globalThis.Response(JSON.stringify(reject ? { message: 'private transient provider fixture' } : { id: messageId }), { status: reject ? 503 : 200 }));
  const first = response();
  await send(request(), first.res);
  assert.equal(first.result.status, 502);
  assert.equal(first.result.body.code, 'OTP_DELIVERY_PENDING');
  assert.equal(first.result.body.activeChallenge.expiresAt, database.originalExpiry.toISOString());
  assert.equal(database.draft?.delivery_state, 'pending');
  assert.equal(database.draft?.consumed_at, null);
  assert.equal(database.oldConsumed, false);
  const originalId = database.draft!.id;
  config.OTP_VALIDITY_SECONDS = 900;
  reject = false;
  const second = response();
  await send(request(), second.res);
  assert.equal(second.result.status, 202);
  assert.equal(database.draft!.id, originalId);
  assert.equal(second.result.body.expiresInSeconds, 600);
  const payloads = provider.mock.calls.map(call => call.arguments[1] as RequestInit);
  assert.equal(payloads.length, 3, 'bounded provider retry plus one later, provider-idempotent route retry');
  assert.ok(payloads.every(payload => payload.body === payloads[0].body));
  assert.ok(payloads.every(payload => new Headers(payload.headers).get('Idempotency-Key') === `otp/${originalId}`));
  assert.deepEqual(JSON.parse(String(payloads[0].body)).to, [email]);
  assert.equal(database.audits, 1);
  assert.equal(database.oldConsumed, true);
});

test('an acknowledged delivery whose audit fails remains retryable without another email or an extended lifetime', async () => {
  const database = fixture(true);
  const provider = mock.method(globalThis, 'fetch', async () => new globalThis.Response(JSON.stringify({ id: messageId }), { status: 200 }));
  const first = response();
  await send(request(), first.res);
  assert.equal(first.result.status, 503);
  assert.equal(first.result.body.code, 'OTP_DELIVERY_PENDING');
  assert.equal(first.result.body.retryAfterSeconds, 2);
  assert.equal(database.draft?.delivery_state, 'pending');
  assert.equal(database.draft?.provider_message_id, messageId);
  const acknowledgedAt = database.draft!.accepted_at!;
  assert.equal(database.oldConsumed, false);
  assert.equal(first.result.body.activeChallenge.expiresAt, database.originalExpiry.toISOString());
  const second = response();
  await send(request(), second.res);
  assert.equal(second.result.status, 202);
  assert.equal(provider.mock.calls.length, 1);
  assert.equal(Date.parse(second.result.body.expiresAt), acknowledgedAt.getTime() + 600000);
  assert.equal(database.audits, 1);
  assert.equal(database.oldConsumed, true);
  assert.ok(!database.statements.some(item => item.sql.includes('WITH failed AS')));
});

test('revocation during email delivery cannot reactivate that challenge after provider acceptance', async () => {
  const database = fixture();
  mock.method(globalThis, 'fetch', async () => {
    assert.ok(database.draft);
    database.draft.consumed_at = new Date();
    return new globalThis.Response(JSON.stringify({ id: messageId }), { status: 200 });
  });
  const { result, res } = response();
  await send(request(), res);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'OTP_CHALLENGE_REVOKED');
  assert.equal(database.draft?.delivery_state, 'pending');
  assert.equal(database.audits, 0);
  assert.ok(!database.statements.some(item => item.sql.includes('SET provider_message_id = COALESCE')));
});

test('restoration returns only an acknowledged code lifetime with a masked destination and no code or HMAC', async () => {
  const database = fixture();
  const { result, res } = response();
  await getOtpStatus(request(), res);
  assert.equal(result.body.verified, false);
  assert.deepEqual(result.body.activeChallenge, { destination: 'p***@spu.ac.za', expiresAt: database.originalExpiry.toISOString(), expiresInSeconds: 240 });
  assert.equal(result.body.retryAfterSeconds, 0);
  assert.ok(!JSON.stringify(result.body).includes(emailHash));
  assert.ok(!JSON.stringify(result.body).includes(email));
  const selection = database.statements[0];
  assert.match(selection.sql, /delivery_state = 'accepted' AND consumed_at IS NULL AND expires_at > now\(\) AND attempts < 5/);
  assert.deepEqual(selection.values?.slice(0, 3), [userId, sessionId, emailHash]);
});

test('an already-ended HTTP response starts no OTP send, status lookup or verification transaction', async () => {
  const connect = mock.method(pool, 'connect', async () => { throw new Error('No database work is expected after the response ended'); });
  const query = mock.method(pool, 'query', async () => { throw new Error('No status lookup is expected after the response ended'); });
  const provider = mock.method(globalThis, 'fetch', async () => { throw new Error('No provider work is expected after the response ended'); });
  const verify = otp.stack.find((layer: any) => layer.route?.path === '/verify').route.stack.at(-1).handle;
  for (const handler of [send, verify, getOtpStatus]) {
    const ended = response();
    ended.close();
    await handler(request(), ended.res);
    assert.equal(ended.result.writes, 0);
  }
  assert.equal(connect.mock.calls.length, 0);
  assert.equal(query.mock.calls.length, 0);
  assert.equal(provider.mock.calls.length, 0);
});

test('a deadline ending after a new reservation cancels that never-sent draft without another HTTP response', async () => {
  const database = fixture();
  const ended = response();
  database.hooks.afterCommit = ended.close;
  const provider = mock.method(globalThis, 'fetch', async () => { throw new Error('A timed-out reservation must not start sending an email'); });
  await send(request(), ended.res);
  assert.equal(provider.mock.calls.length, 0);
  assert.equal(ended.result.writes, 0);
  assert.equal(database.draft?.delivery_state, 'failed');
  assert.ok(database.draft?.consumed_at);
  assert.equal(database.oldConsumed, false);
  const cleanup = database.statements.find(item => item.sql.includes('WITH failed AS'))!;
  assert.equal(cleanup.values?.[1], true);
  assert.equal(cleanup.values?.[2], 2);
});

test('a deadline ending during an uncertain replay preserves the earlier draft and its old accepted code', async () => {
  const database = fixture();
  const provider = mock.method(globalThis, 'fetch', async () => globalThis.Response.json({}, { status: 503 }));
  await send(request(), response().res);
  const originalId = database.draft!.id;
  const ended = response();
  database.hooks.afterCommit = ended.close;
  await send(request(), ended.res);
  assert.equal(provider.mock.calls.length, 2, 'no new provider call starts after the response ended');
  assert.equal(ended.result.writes, 0);
  assert.equal(database.draft?.id, originalId);
  assert.equal(database.draft?.delivery_state, 'pending');
  assert.equal(database.draft?.consumed_at, null);
  assert.equal(database.oldConsumed, false);
  assert.equal(database.statements.filter(item => item.sql.includes('WITH failed AS')).at(-1)?.values?.[1], false);
});

test('a deadline ending before cached acknowledgement recovery retains its acknowledgement without sending again', async () => {
  const database = fixture(true);
  const provider = mock.method(globalThis, 'fetch', async () => globalThis.Response.json({ id: messageId }));
  await send(request(), response().res);
  const originalAck = database.draft!.accepted_at!;
  const ended = response();
  database.hooks.afterCommit = ended.close;
  await send(request(), ended.res);
  assert.equal(provider.mock.calls.length, 1);
  assert.equal(ended.result.writes, 0);
  assert.equal(database.draft?.delivery_state, 'pending');
  assert.equal(database.draft?.consumed_at, null);
  assert.deepEqual(database.draft?.accepted_at, originalAck);
  assert.equal(database.draft?.provider_message_id, messageId);
  const recovered = response();
  await send(request(), recovered.res);
  assert.equal(recovered.result.status, 202);
  assert.equal(Date.parse(recovered.result.body.expiresAt), originalAck.getTime() + 600000);
  assert.equal(provider.mock.calls.length, 1);
});

test('provider acceptance after the HTTP deadline is still committed safely without a second response', async () => {
  const database = fixture();
  const ended = response();
  mock.method(globalThis, 'fetch', async () => { ended.close(); return globalThis.Response.json({ id: messageId }); });
  await send(request(), ended.res);
  assert.equal(ended.result.writes, 0);
  assert.equal(database.draft?.delivery_state, 'accepted');
  assert.equal(database.audits, 1);
  assert.equal(database.oldConsumed, true);
});

test('a completed valid verification whose response times out keeps its single-use proof without another response', async () => {
  const ended = response();
  const statements: string[] = [];
  mock.method(pool, 'connect', async () => ({
    async query(sql: string) {
      statements.push(sql);
      if (sql.includes('SELECT id, code_hash')) return { rows: [{ id: messageId, code_hash: otpCodeHash(userId, sessionId, emailHash, '123456').toString('hex'), attempts: 0, expired: false }], rowCount: 1 };
      if (sql === 'COMMIT') ended.close();
      return { rows: [], rowCount: 1 };
    }, release() {},
  }));
  const req = request();
  req.body = { code: '123456' };
  const verify = otp.stack.find((layer: any) => layer.route?.path === '/verify').route.stack.at(-1).handle;
  await verify(req, ended.res);
  assert.equal(ended.result.writes, 0);
  assert.ok(statements.some(sql => sql.includes('INSERT INTO otp_verified_sessions')));
  assert.equal(statements.at(-1), 'COMMIT');
  assert.ok(!statements.includes('ROLLBACK'));
});
