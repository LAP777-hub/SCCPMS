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
  const originalSender = config.RESEND_FROM_EMAIL;
  const migration = await readFile(new URL('../sql/022_otp_delivery_timing.sql', import.meta.url), 'utf8');
  const senderMigration = await readFile(new URL('../sql/023_otp_sender_binding.sql', import.meta.url), 'utf8');
  const cooldown = (error: unknown) => error instanceof OtpChallengeError && error.code === 'OTP_RESEND_COOLDOWN' && error.retryAfterSeconds > 0;
  try {
    config.RESEND_FROM_EMAIL = 'SCCPMS <login@otp-database-fixture.co.za>';
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

    // The provider cutover must not reinterpret an uncertain Resend draft as a
    // Brevo retry, including when the configured sender is identical.
    await database.query('CREATE TABLE profiles (id uuid PRIMARY KEY, role text NOT NULL)');
    const cutoverMigration = await readFile(new URL('../sql/026_retire_legacy_nonadmin_otp_drafts.sql', import.meta.url), 'utf8');
    const cutoverCases = [
      { role: 'patient', retire: true },
      { role: 'doctor', retire: true },
      { role: 'receptionist', retire: true },
      { role: 'admin', retire: false },
      { role: 'patient', retire: false, state: 'accepted' },
      { role: 'patient', retire: false, providerMessageId: randomUUID() },
      { role: 'doctor', retire: false, acceptedAt: new Date() },
      { role: 'receptionist', retire: false, providerMessageId: randomUUID(), acceptedAt: new Date() },
      { role: 'patient', retire: false, consumedAt: new Date() },
      { role: 'patient', retire: false, state: 'failed' },
      { role: null, retire: false },
    ];
    const retiredIds: string[] = [];
    for (const fixture of cutoverCases) {
      const fixtureIdentity = newIdentity();
      const id = randomUUID();
      if (fixture.retire) retiredIds.push(id);
      if (fixture.role) await database.query('INSERT INTO profiles(id,role) VALUES ($1,$2)', [fixtureIdentity.userId, fixture.role]);
      await database.query(`INSERT INTO otp_challenges
        (id,user_id,session_id,email_hash,code_hash,delivery_state,expires_at,sent_at,
         delivery_finished_at,retry_after_at,provider_message_id,accepted_at,consumed_at,sender_from)
        VALUES ($1,$2,$3,$4,$5,$6,now()+interval '5 minutes',now()-interval '1 minute',
          now()-interval '30 seconds',now()+interval '30 seconds',$7,$8,$9,$10)`,
      [id, fixtureIdentity.userId, fixtureIdentity.sessionId, fixtureIdentity.emailHash, pending.code_hash,
        fixture.state ?? 'pending', fixture.providerMessageId ?? null, fixture.acceptedAt ?? null,
        fixture.consumedAt ?? null, savedSender]);
      await database.query(`INSERT INTO otp_verified_sessions(user_id,session_id,email_hash,expires_at)
        VALUES ($1,$2,$3,'infinity'::timestamptz)`, [fixtureIdentity.userId, fixtureIdentity.sessionId, fixtureIdentity.emailHash]);
    }
    const beforeCutover = (await database.query('SELECT * FROM otp_challenges ORDER BY id')).rows;
    const verifiedBeforeCutover = (await database.query('SELECT * FROM otp_verified_sessions ORDER BY user_id,session_id')).rows;
    await database.query(cutoverMigration);
    const afterCutover = (await database.query('SELECT * FROM otp_challenges ORDER BY id')).rows;
    const retiredRows = afterCutover.filter(row => retiredIds.includes(row.id));
    assert.equal(retiredRows.length, 3, 'only the three unacknowledged non-admin drafts are retired');
    for (const row of retiredRows) {
      assert.equal(row.delivery_state, 'failed');
      assert.ok(row.consumed_at instanceof Date, 'the cutover consumes the uncertain draft');
      assert.ok(row.delivery_finished_at instanceof Date && row.retry_after_at instanceof Date);
      assert.ok(row.consumed_at.getTime() === row.delivery_finished_at.getTime()
        && row.consumed_at.getTime() === row.retry_after_at.getTime(), 'all retirement timestamps share the atomic update time');
      const before = beforeCutover.find(candidate => candidate.id === row.id);
      const unchangedFields = ({ delivery_state, consumed_at, delivery_finished_at, retry_after_at, ...fields }: typeof row) => fields;
      assert.ok(JSON.stringify(unchangedFields(row)) === JSON.stringify(unchangedFields(before)), 'the cutover preserves the draft identity, hash, sender and expiry');
    }
    assert.ok(JSON.stringify(afterCutover.filter(row => !retiredIds.includes(row.id)))
      === JSON.stringify(beforeCutover.filter(row => !retiredIds.includes(row.id))),
    'accepted, acknowledged, admin, consumed, failed and unmatched drafts remain unchanged');
    assert.ok(JSON.stringify((await database.query('SELECT * FROM otp_verified_sessions ORDER BY user_id,session_id')).rows)
      === JSON.stringify(verifiedBeforeCutover), 'the cutover neither grants nor revokes verified sessions');
    const cutoverAudits = (await database.query(`SELECT actor_user_id,entity_type,entity_id FROM audit_events
      WHERE action='auth.otp_provider_cutover' ORDER BY entity_id`)).rows;
    assert.equal(cutoverAudits.length, 3);
    assert.ok(cutoverAudits.every(event => event.entity_type === 'otp_challenge'
      && retiredRows.some(row => row.id === event.entity_id && row.user_id === event.actor_user_id)), 'each retired draft has one correctly attributed audit event');
    await database.query(cutoverMigration);
    assert.ok(JSON.stringify((await database.query('SELECT * FROM otp_challenges ORDER BY id')).rows)
      === JSON.stringify(afterCutover), 'reapplying the cutover changes no challenge');
    assert.equal((await database.query("SELECT count(*)::int AS count FROM audit_events WHERE action='auth.otp_provider_cutover'")).rows[0].count, 3, 'reapplying the cutover creates no duplicate audit events');
    assert.ok(JSON.stringify((await database.query('SELECT * FROM otp_verified_sessions ORDER BY user_id,session_id')).rows)
      === JSON.stringify(verifiedBeforeCutover), 'verified sessions are also unchanged on reapplication');
    const fiveMinuteMigration = await readFile(new URL('../sql/028_five_minute_otp_policy.sql', import.meta.url), 'utf8');
    const policyCases = [
      { state: 'pending', seconds: 600, retire: true },
      { state: 'pending', seconds: 300, retire: false },
      { state: 'accepted', seconds: 600, retire: false },
      { state: 'accepted', seconds: 240, retire: false },
    ];
    const policyIds: string[] = [], accepted = new Date();
    for (const fixture of policyCases) {
      const who = newIdentity(), id = randomUUID(); policyIds.push(id);
      await database.query(`INSERT INTO otp_challenges(id,user_id,session_id,email_hash,code_hash,delivery_state,
        expires_at,accepted_at,validity_seconds,code_version,delivery_attempt_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,now())`,
      [id, who.userId, who.sessionId, who.emailHash, pending.code_hash, fixture.state,
        new Date(accepted.getTime() + fixture.seconds * 1000), fixture.state === 'accepted' ? accepted : null, fixture.seconds]);
    }
    await database.query(fiveMinuteMigration);
    for (let index = 0; index < policyCases.length; index++) {
      const fixture = policyCases[index];
      const row = (await database.query('SELECT * FROM otp_challenges WHERE id=$1', [policyIds[index]])).rows[0];
      assert.equal(Boolean(row.consumed_at), fixture.retire);
      if (fixture.state === 'accepted') assert.equal(row.expires_at.getTime(), accepted.getTime() + Math.min(fixture.seconds, 300) * 1000);
    }
    const policyAfter = (await database.query('SELECT * FROM otp_challenges ORDER BY id')).rows;
    const auditCount = (await database.query("SELECT count(*)::int AS count FROM audit_events WHERE action='auth.otp_five_minute_policy'")).rows[0].count;
    await database.query(fiveMinuteMigration);
    assert.deepEqual((await database.query('SELECT * FROM otp_challenges ORDER BY id')).rows, policyAfter);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM audit_events WHERE action='auth.otp_five_minute_policy'")).rows[0].count, auditCount);
    assert.deepEqual((await database.query('SELECT * FROM otp_verified_sessions ORDER BY user_id,session_id')).rows, verifiedBeforeCutover);
  } finally {
    config.OTP_VALIDITY_SECONDS = originalValidity;
    config.RESEND_FROM_EMAIL = originalSender;
    await database.end();
    assert.match(schema, /^clinic_otp_delivery_test_[a-f0-9]{32}$/);
    await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    control.release();
    await pool.end();
  }
});
