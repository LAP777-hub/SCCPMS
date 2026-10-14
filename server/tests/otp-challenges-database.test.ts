import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import {
  challengeCode, finalizeOtpChallenge, OtpChallengeError, readOtpState,
  recordOtpDeliveryFailure, reserveOtpChallenge, retainOtpAcknowledgement,
} from '../src/otp-challenges.js';
import { otpCodeHash, otpEmailHash } from '../src/otp-security.js';

test('OTP delivery leases, acknowledgement transactions and retries preserve real database security in an isolated schema', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async () => {
  const schema = `clinic_otp_delivery_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^clinic_otp_delivery_test_[a-f0-9]{32}$/);
  const control = await pool.connect();
  const database = new pg.Pool({ ...pool.options, options: `-c search_path=${schema},public`, max: 3 });
  const newIdentity = () => {
    const userId = randomUUID();
    return { userId, sessionId: randomUUID(), emailHash: otpEmailHash(userId, 'patient@spu.ac.za')! };
  };
  const identity = newIdentity();
  const originalId = randomUUID(), messageId = randomUUID();
  const originalValidity = config.OTP_VALIDITY_SECONDS;
  const migration = await readFile(new URL('../sql/022_otp_delivery_timing.sql', import.meta.url), 'utf8');
  const senderMigration = await readFile(new URL('../sql/023_otp_sender_binding.sql', import.meta.url), 'utf8');
  const cooldown = (error: unknown) => error instanceof OtpChallengeError && error.code === 'OTP_RESEND_COOLDOWN' && error.retryAfterSeconds > 0;
  try {
    await control.query(`CREATE SCHEMA "${schema}"`);
    assert.equal((await database.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    await database.query(`CREATE TABLE otp_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,session_id uuid NOT NULL,
      code_hash text NOT NULL,expires_at timestamptz NOT NULL,
      attempts smallint NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
      sent_at timestamptz NOT NULL DEFAULT now(),consumed_at timestamptz);
      CREATE TABLE otp_verified_sessions (user_id uuid NOT NULL,session_id uuid NOT NULL,
        verified_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,PRIMARY KEY(user_id,session_id));`);
    await database.query(await readFile(new URL('../sql/014_otp_phone_binding.sql', import.meta.url), 'utf8'));
    await database.query(await readFile(new URL('../sql/015_otp_email_binding.sql', import.meta.url), 'utf8'));
    await database.query(await readFile(new URL('../sql/002_notifications_audit.sql', import.meta.url), 'utf8'));
    await database.query(`INSERT INTO otp_challenges(id,user_id,session_id,email_hash,code_hash,delivery_state,expires_at,sent_at)
      VALUES ($1,$2,$3,$4,$5,'accepted',now()+interval '4 minutes',now()-interval '1 minute')`,
    [originalId, identity.userId, identity.sessionId, identity.emailHash, otpCodeHash(identity.userId, identity.sessionId, identity.emailHash, '123456').toString('hex')]);
    const original = (await database.query('SELECT * FROM otp_challenges WHERE id=$1', [originalId])).rows[0];
    await database.query(migration);
    await database.query(migration);
    await database.query(senderMigration);
    await database.query(senderMigration);
    const migrated = (await database.query('SELECT * FROM otp_challenges WHERE id=$1', [originalId])).rows[0];
    assert.deepEqual(migrated.expires_at, original.expires_at);
    assert.equal(migrated.code_version, 0);
    assert.equal(migrated.accepted_at, null);
    assert.equal(migrated.sender_from, null);

    const failedLease = await reserveOtpChallenge(database, identity);
    assert.match(challengeCode(identity, failedLease.id), /^[1-9][0-9]{5}$/);
    assert.equal((await database.query('SELECT consumed_at FROM otp_challenges WHERE id=$1', [originalId])).rows[0].consumed_at, null);
    await assert.rejects(reserveOtpChallenge(database, { ...identity, sessionId: randomUUID() }), cooldown);
    await recordOtpDeliveryFailure(database, identity, failedLease, 'not_sent', 2);
    const failed = (await database.query('SELECT * FROM otp_challenges WHERE id=$1', [failedLease.id])).rows[0];
    assert.equal(failed.delivery_state, 'failed');
    assert.ok(failed.consumed_at);
    assert.equal((await readOtpState(database, identity)).verified, false);
    assert.deepEqual((await readOtpState(database, identity)).activeExpiresAt, original.expires_at);
    await assert.rejects(reserveOtpChallenge(database, identity), cooldown);
    await database.query('UPDATE otp_challenges SET retry_after_at=now()-interval \'1 second\' WHERE id=$1', [failedLease.id]);

    const savedSender = 'SCCPMS <login@original-sender-fixture.co.za>';
    const uncertainLease = await reserveOtpChallenge(database, identity, savedSender);
    assert.equal((await database.query('SELECT sender_from FROM otp_challenges WHERE id=$1', [uncertainLease.id])).rows[0].sender_from, savedSender);
    const sameCode = challengeCode(identity, uncertainLease.id);
    await recordOtpDeliveryFailure(database, identity, uncertainLease, 'unknown', 2);
    const pending = (await database.query('SELECT * FROM otp_challenges WHERE id=$1', [uncertainLease.id])).rows[0];
    assert.equal(pending.delivery_state, 'pending');
    assert.equal(pending.consumed_at, null);
    assert.equal(pending.code_hash, otpCodeHash(identity.userId, identity.sessionId, identity.emailHash, sameCode).toString('hex'));
    assert.notEqual(pending.code_hash, sameCode);
    await database.query('UPDATE otp_challenges SET retry_after_at=now()-interval \'1 second\' WHERE id=$1', [uncertainLease.id]);
    config.OTP_VALIDITY_SECONDS = originalValidity === 900 ? 600 : 900;
    const retry = await reserveOtpChallenge(database, identity);
    config.OTP_VALIDITY_SECONDS = originalValidity;
    assert.equal(retry.id, uncertainLease.id);
    assert.equal(retry.validitySeconds, uncertainLease.validitySeconds);
    assert.equal(retry.senderFrom, savedSender);
    assert.equal(challengeCode(identity, retry.id), sameCode);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM otp_challenges WHERE user_id=$1', [identity.userId])).rows[0].count, 3);

    const acknowledgedAt = new Date();
    await database.query(`CREATE FUNCTION fail_delivery_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='auth.otp_requested' THEN RAISE EXCEPTION 'Isolated delivery audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_delivery_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_delivery_audit();`);
    await assert.rejects(finalizeOtpChallenge(database, identity, retry, messageId, acknowledgedAt), /Isolated delivery audit failure/);
    const rolledBack = (await database.query('SELECT delivery_state,accepted_at FROM otp_challenges WHERE id=$1', [retry.id])).rows[0];
    assert.deepEqual(rolledBack, { delivery_state: 'pending', accepted_at: null });
    assert.equal((await database.query('SELECT consumed_at FROM otp_challenges WHERE id=$1', [originalId])).rows[0].consumed_at, null);
    await retainOtpAcknowledgement(database, identity, retry, messageId, acknowledgedAt);
    const cached = (await database.query('SELECT delivery_state,accepted_at,provider_message_id FROM otp_challenges WHERE id=$1', [retry.id])).rows[0];
    assert.deepEqual(cached, { delivery_state: 'pending', accepted_at: acknowledgedAt, provider_message_id: messageId });
    assert.deepEqual((await readOtpState(database, identity)).activeExpiresAt, original.expires_at);
    await database.query('DROP TRIGGER fail_delivery_audit ON audit_events');
    const [expiresAt, duplicateExpiry] = await Promise.all([
      finalizeOtpChallenge(database, identity, retry, messageId, new Date()),
      finalizeOtpChallenge(database, identity, retry, messageId, new Date(Date.now() + 30000)),
    ]);
    assert.deepEqual(expiresAt, duplicateExpiry);
    assert.equal(expiresAt.getTime(), acknowledgedAt.getTime() + retry.validitySeconds * 1000);
    assert.ok((await database.query('SELECT consumed_at FROM otp_challenges WHERE id=$1', [originalId])).rows[0].consumed_at);
    assert.deepEqual((await readOtpState(database, identity)).activeExpiresAt, expiresAt);
    assert.equal((await readOtpState(database, identity)).verified, false, 'provider acceptance never verifies a login session');
    await recordOtpDeliveryFailure(database, identity, retry, 'not_sent', 2);
    assert.equal((await database.query('SELECT delivery_state FROM otp_challenges WHERE id=$1', [retry.id])).rows[0].delivery_state, 'accepted');
    assert.equal((await database.query("SELECT count(*)::int AS count FROM audit_events WHERE action='auth.otp_requested' AND entity_id=$1", [retry.id])).rows[0].count, 1);
    assert.equal((await readOtpState(database, { ...identity, sessionId: randomUUID() })).activeExpiresAt, null);
    assert.equal((await readOtpState(database, { ...identity, emailHash: otpEmailHash(identity.userId, 'changed@spu.ac.za')! })).activeExpiresAt, null);
    await database.query('UPDATE otp_challenges SET attempts=5 WHERE id=$1', [retry.id]);
    assert.equal((await readOtpState(database, identity)).activeExpiresAt, null, 'an exhausted challenge cannot offer a usable countdown');

    const revokedIdentity = newIdentity();
    const revoked = await reserveOtpChallenge(database, revokedIdentity);
    await database.query('UPDATE otp_challenges SET consumed_at=now() WHERE id=$1', [revoked.id]);
    await assert.rejects(finalizeOtpChallenge(database, revokedIdentity, revoked, randomUUID(), new Date()), (error: unknown) => error instanceof OtpChallengeError && error.code === 'OTP_CHALLENGE_REVOKED');
    const agedIdentity = newIdentity();
    const aged = await reserveOtpChallenge(database, agedIdentity);
    await database.query('UPDATE otp_challenges SET sent_at=now()-interval \'16 minutes\',retry_after_at=now()-interval \'1 minute\' WHERE id=$1', [aged.id]);
    await assert.rejects(finalizeOtpChallenge(database, agedIdentity, aged, randomUUID(), new Date()), (error: unknown) => error instanceof OtpChallengeError && error.code === 'OTP_CHALLENGE_REVOKED');
    assert.notEqual((await reserveOtpChallenge(database, agedIdentity)).id, aged.id);

    const cappedIdentity = newIdentity();
    await database.query(`INSERT INTO otp_challenges(user_id,session_id,email_hash,code_hash,delivery_state,expires_at,sent_at,delivery_finished_at,retry_after_at,consumed_at)
      SELECT $1,$2,$3,$4,'failed',now(),now()-interval '5 minutes',now()-interval '5 minutes',now()-interval '4 minutes',now() FROM generate_series(1,10)`,
    [cappedIdentity.userId, cappedIdentity.sessionId, cappedIdentity.emailHash, pending.code_hash]);
    await assert.rejects(reserveOtpChallenge(database, cappedIdentity), (error: unknown) => error instanceof OtpChallengeError && error.code === 'OTP_HOURLY_LIMIT');
    await assert.rejects(database.query('UPDATE otp_challenges SET validity_seconds=100 WHERE id=$1', [retry.id]), (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === '23514');
    await database.query(migration);
    assert.deepEqual((await database.query('SELECT expires_at FROM otp_challenges WHERE id=$1', [retry.id])).rows[0].expires_at, expiresAt);
  } finally {
    config.OTP_VALIDITY_SECONDS = originalValidity;
    await database.end();
    assert.match(schema, /^clinic_otp_delivery_test_[a-f0-9]{32}$/);
    await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    control.release();
    await pool.end();
  }
});
