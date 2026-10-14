import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, mock, test } from 'node:test';
import type { Pool } from 'pg';
import { config } from '../src/config.js';
import {
  challengeCode, finalizeOtpChallenge, OtpChallengeError, recordOtpDeliveryFailure,
  reserveOtpChallenge, retainOtpAcknowledgement,
} from '../src/otp-challenges.js';
import { otpEmailHash } from '../src/otp-security.js';

afterEach(() => mock.restoreAll());
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const challengeId = '00000000-0000-4000-8000-000000000003';
const messageId = '00000000-0000-4000-8000-000000000004';
const identity = { userId, sessionId, emailHash: otpEmailHash(userId, 'patient@spu.ac.za')! };
const lease = { id: challengeId, validitySeconds: 600, acceptedAt: null, providerMessageId: null };

function databaseFixture(options: {
  policy?: object; challenge?: object | null; failAudit?: boolean; failLease?: boolean;
} = {}) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  const database = {
    async connect() {
      return {
        async query(sql: string, values?: unknown[]) {
          statements.push({ sql, values });
          if (sql.includes('SELECT policy.*')) return { rows: [options.policy ?? { hourly_count: 0, retry_after_seconds: 0, id: null }], rowCount: 1 };
          if (sql.includes('SELECT delivery_state')) return { rows: options.challenge === null ? [] : [options.challenge ?? {
            delivery_state: 'pending', consumed_at: null, accepted_at: null,
            expires_at: new Date(), validity_seconds: 600, too_old: false,
          }], rowCount: options.challenge === null ? 0 : 1 };
          if (options.failAudit && sql.includes('auth.otp_requested')) throw new Error('isolated audit failure');
          return { rows: [], rowCount: options.failLease && sql.includes('SET delivery_attempt_at') ? 0 : 1 };
        },
        release() { statements.push({ sql: 'release' }); },
      };
    },
    async query(sql: string, values?: unknown[]) { statements.push({ sql, values }); return { rows: [], rowCount: 1 }; },
  } as unknown as Pick<Pool, 'query' | 'connect'>;
  return { database, statements };
}

test('recoverable codes use a private derivation domain and all identity and challenge bindings', () => {
  const code = challengeCode(identity, challengeId);
  assert.match(code, /^[1-9][0-9]{5}$/);
  assert.equal(code, challengeCode(identity, challengeId));
  const ids = Array.from({ length: 40 }, () => randomUUID());
  assert.ok(new Set(ids.map(id => challengeCode(identity, id))).size > 35);
  for (const alternative of [
    { ...identity, userId: randomUUID() },
    { ...identity, sessionId: randomUUID() },
    { ...identity, emailHash: otpEmailHash(userId, 'other@spu.ac.za')! },
  ]) {
    // Compare several nonces so an ordinary six-digit collision cannot make the test flaky.
    assert.ok(ids.some(id => challengeCode(identity, id) !== challengeCode(alternative, id)));
  }
});

test('new reservations preserve accepted codes and persist the validity for idempotent replay', async () => {
  const { database, statements } = databaseFixture();
  const reserved = await reserveOtpChallenge(database, identity);
  assert.equal(reserved.validitySeconds, config.OTP_VALIDITY_SECONDS);
  assert.equal(reserved.providerMessageId, null);
  const insert = statements.find(item => item.sql.includes('INSERT INTO otp_challenges'))!;
  assert.equal(insert.values?.[0], reserved.id);
  assert.equal(insert.values?.[4], identity.emailHash);
  assert.match(String(insert.values?.[3]), /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(insert.values).includes(challengeCode(identity, reserved.id)));
  assert.match(insert.sql, /delivery_state = 'pending'/);
  assert.ok(!insert.sql.includes("delivery_state = 'accepted'"));
  assert.deepEqual(statements.slice(-2).map(item => item.sql), ['COMMIT', 'release']);
});

test('pending replay preserves its identifier, acknowledgement and payload duration even at the hourly cap', async () => {
  const acknowledgedAt = new Date(Date.now() - 10000);
  const { database, statements } = databaseFixture({ policy: {
    hourly_count: 10, retry_after_seconds: 0, id: challengeId,
    validity_seconds: 900, provider_message_id: messageId, accepted_at: acknowledgedAt,
  } });
  const result = await reserveOtpChallenge(database, identity);
  assert.deepEqual(result, { id: challengeId, validitySeconds: 900, providerMessageId: messageId, acceptedAt: acknowledgedAt, newlyCreated: false });
  assert.ok(!statements.some(item => item.sql.includes('INSERT INTO otp_challenges')));
  const acquire = statements.find(item => item.sql.includes('SET delivery_attempt_at'))!;
  assert.match(acquire.sql, /interval '30 seconds'/);
  assert.match(acquire.sql, /consumed_at IS NULL/);
  assert.deepEqual(acquire.values, [challengeId, userId, sessionId, identity.emailHash]);
});

for (const [name, policy, expected] of [
  ['accepted or pending cooldown', { hourly_count: 1, retry_after_seconds: 27, id: null }, 'OTP_RESEND_COOLDOWN'],
  ['hourly cap including failed sends', { hourly_count: 10, retry_after_seconds: 0, id: null }, 'OTP_HOURLY_LIMIT'],
] as const) test(`${name} prevents a new draft`, async () => {
  const { database, statements } = databaseFixture({ policy });
  await assert.rejects(reserveOtpChallenge(database, identity), (error: unknown) => error instanceof OtpChallengeError && error.code === expected);
  assert.ok(!statements.some(item => item.sql.includes('INSERT INTO otp_challenges')));
  assert.deepEqual(statements.slice(-2).map(item => item.sql), ['ROLLBACK', 'release']);
});

test('logout or revocation during pending reservation cannot revive that draft', async () => {
  const { database } = databaseFixture({ policy: { hourly_count: 1, retry_after_seconds: 0, id: challengeId, validity_seconds: 600 }, failLease: true });
  await assert.rejects(reserveOtpChallenge(database, identity), (error: unknown) => error instanceof OtpChallengeError && error.code === 'OTP_CHALLENGE_REVOKED');
});

test('acknowledgement starts the full validity window and replaces the previous code in one audited transaction', async () => {
  const { database, statements } = databaseFixture();
  const acknowledgedAt = new Date();
  const expiresAt = await finalizeOtpChallenge(database, identity, lease, messageId, acknowledgedAt);
  assert.equal(expiresAt.getTime() - acknowledgedAt.getTime(), 600000);
  const mutation = statements.find(item => item.sql.includes('auth.otp_requested'))!;
  assert.equal(mutation.values?.[2], acknowledgedAt);
  assert.deepEqual(mutation.values?.[3], expiresAt);
  assert.match(mutation.sql, /WITH accepted AS/);
  assert.match(mutation.sql, /superseded AS/);
  assert.match(mutation.sql, /id <> \$1/);
  assert.deepEqual(mutation.values?.slice(-2), [userId, sessionId]);
  assert.deepEqual(statements.slice(-2).map(item => item.sql), ['COMMIT', 'release']);
});

test('repeated finalization returns the original expiry without another update, audit or extension', async () => {
  const originalExpiry = new Date(Date.now() + 250000);
  const { database, statements } = databaseFixture({ challenge: {
    delivery_state: 'accepted', consumed_at: null, expires_at: originalExpiry,
    accepted_at: new Date(Date.now() - 350000), validity_seconds: 600, too_old: false,
  } });
  assert.deepEqual(await finalizeOtpChallenge(database, identity, lease, messageId, new Date()), originalExpiry);
  assert.ok(!statements.some(item => item.sql.includes('auth.otp_requested')));
});

test('cached acknowledgement recovery keeps the original expiry instead of restarting the timer', async () => {
  const originalAck = new Date(Date.now() - 70000);
  const { database } = databaseFixture({ challenge: {
    delivery_state: 'pending', consumed_at: null, expires_at: new Date(),
    accepted_at: originalAck, validity_seconds: 600, too_old: false,
  } });
  const recovered = await finalizeOtpChallenge(database, identity, lease, messageId, new Date());
  assert.equal(recovered.getTime(), originalAck.getTime() + 600000);
});

test('an audit failure rolls back acknowledgement and supersession, and retains a pending acknowledgement for retry', async () => {
  const { database, statements } = databaseFixture({ failAudit: true });
  const acknowledgedAt = new Date();
  await assert.rejects(finalizeOtpChallenge(database, identity, lease, messageId, acknowledgedAt), /isolated audit failure/);
  assert.deepEqual(statements.slice(-2).map(item => item.sql), ['ROLLBACK', 'release']);
  await retainOtpAcknowledgement(database, identity, lease, messageId, acknowledgedAt);
  const retained = statements.at(-1)!;
  assert.match(retained.sql, /delivery_state = 'pending' AND consumed_at IS NULL/);
  assert.match(retained.sql, /COALESCE\(accepted_at, \$3\)/);
  assert.ok(!retained.sql.includes("delivery_state = 'failed'"));
});

for (const [name, challenge] of [
  ['revoked', { delivery_state: 'pending', consumed_at: new Date(), validity_seconds: 600, too_old: false }],
  ['failed', { delivery_state: 'failed', consumed_at: null, validity_seconds: 600, too_old: false }],
  ['older than the 15-minute retry window', { delivery_state: 'pending', consumed_at: null, validity_seconds: 600, too_old: true }],
  ['cached acknowledgement expired', { delivery_state: 'pending', consumed_at: null, accepted_at: new Date(Date.now() - 610000), validity_seconds: 600, too_old: false }],
] as const) test(`${name} draft cannot become a verified or accepted challenge`, async () => {
  const { database, statements } = databaseFixture({ challenge });
  await assert.rejects(finalizeOtpChallenge(database, identity, lease, messageId, new Date()), (error: unknown) => error instanceof OtpChallengeError && error.status === 409);
  assert.ok(!statements.some(item => item.sql.includes('auth.otp_requested')));
});

for (const outcome of ['not_sent', 'unknown'] as const) test(`${outcome} failure only changes its own unacknowledged draft`, async () => {
  const { database, statements } = databaseFixture();
  await recordOtpDeliveryFailure(database, identity, lease, outcome, 2);
  const mutation = statements[0];
  assert.deepEqual(mutation.values, [challengeId, outcome === 'not_sent', 2, userId, sessionId, identity.emailHash]);
  assert.match(mutation.sql, /delivery_state = 'pending' AND consumed_at IS NULL AND provider_message_id IS NULL/);
  assert.match(mutation.sql, /WHERE id = \$1/);
  assert.match(mutation.sql, /auth.otp_send_failed/);
  assert.match(mutation.sql, /auth.otp_delivery_pending/);
});
