import { createHmac, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { config } from './config.js';
import { otpCodeHash } from './otp-security.js';

type Database = Pick<Pool, 'query' | 'connect'>;
export interface OtpIdentity { userId: string; sessionId: string; emailHash: string }
export interface OtpLease {
  id: string;
  validitySeconds: number;
  providerMessageId: string | null;
  acceptedAt: Date | null;
  newlyCreated?: boolean;
  senderFrom?: string;
}
export class OtpChallengeError extends Error {
  constructor(public readonly code: 'OTP_RESEND_COOLDOWN' | 'OTP_HOURLY_LIMIT' | 'OTP_CHALLENGE_REVOKED', public readonly status: number, public readonly retryAfterSeconds = 0) {
    super(code);
  }
}

// Random challenge identifiers and a secret, separate HMAC domain produce a
// reproducible code for provider-idempotent retries without storing its plaintext.
export function challengeCode(identity: OtpIdentity, id: string): string {
  for (let counter = 0; ; counter++) {
    const digest = createHmac('sha256', config.OTP_HMAC_SECRET)
      .update(`otp-delivery-code:v1:${identity.userId}:${identity.sessionId}:${identity.emailHash}:${id}:${counter}`).digest();
    const value = digest.readUInt32BE(0);
    const unbiasedLimit = Math.floor(0x100000000 / 900000) * 900000;
    if (value < unbiasedLimit) return String(100000 + value % 900000);
  }
}

// Every new draft counts toward the hourly cap, including failed deliveries.
// Cooldowns cover all of the user's sessions. A pending request owns a 30-second
// lease; definite failures have a short backoff rather than a full resend delay.
const policyCte = `WITH recent AS (
  SELECT * FROM otp_challenges WHERE user_id = $1 AND sent_at > now() - interval '1 hour'
), policy AS (
  SELECT count(*)::int AS hourly_count,
    COALESCE(GREATEST(0, ceil(extract(epoch FROM max(CASE
      WHEN delivery_state = 'accepted' THEN COALESCE(retry_after_at, COALESCE(accepted_at, sent_at) + make_interval(secs => $4::int))
      WHEN delivery_state = 'pending' AND consumed_at IS NULL AND sent_at > now() - interval '15 minutes'
        THEN COALESCE(retry_after_at, COALESCE(delivery_attempt_at, sent_at) + interval '30 seconds')
      WHEN delivery_state = 'failed' THEN COALESCE(retry_after_at, COALESCE(delivery_finished_at, sent_at) + interval '2 seconds')
    END) - now()))), 0)::int AS retry_after_seconds
  FROM recent
)`;

export async function readOtpState(database: Pick<Pool, 'query'>, identity: OtpIdentity) {
  const result = await database.query<{
    verified: boolean; active_expires_at: Date | null; retry_after_seconds: number;
  }>(`${policyCte}
    SELECT EXISTS(SELECT 1 FROM otp_verified_sessions
      WHERE user_id = $1 AND session_id = $2 AND email_hash = $3 AND expires_at > now()) AS verified,
      (SELECT expires_at FROM otp_challenges
       WHERE user_id = $1 AND session_id = $2 AND email_hash = $3
         AND delivery_state = 'accepted' AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
       ORDER BY COALESCE(accepted_at, sent_at) DESC LIMIT 1) AS active_expires_at,
      policy.retry_after_seconds
    FROM policy`, [identity.userId, identity.sessionId, identity.emailHash, config.OTP_RESEND_COOLDOWN_SECONDS]);
  const row = result.rows[0];
  return { verified: Boolean(row?.verified), activeExpiresAt: row?.active_expires_at ? new Date(row.active_expires_at) : null, retryAfterSeconds: Number(row?.retry_after_seconds ?? 0) };
}

export async function reserveOtpChallenge(database: Database, identity: OtpIdentity, requestedSender = config.RESEND_FROM_EMAIL): Promise<OtpLease> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp-send:${identity.userId}`]);
    const result = await client.query<{
      hourly_count: number; retry_after_seconds: number;
      id: string | null; validity_seconds: number | null; provider_message_id: string | null; accepted_at: Date | null; sender_from: string | null;
    }>(`${policyCte}
      SELECT policy.*, pending.id, pending.validity_seconds, pending.provider_message_id, pending.accepted_at, pending.sender_from
      FROM policy LEFT JOIN LATERAL (
        SELECT id, validity_seconds, provider_message_id, accepted_at, sender_from FROM recent
        WHERE session_id = $2 AND email_hash = $3 AND delivery_state = 'pending' AND consumed_at IS NULL
          AND code_version = 1 AND sent_at > now() - interval '15 minutes'
          AND (accepted_at IS NULL OR accepted_at + make_interval(secs => validity_seconds::int) > now())
        ORDER BY sent_at DESC LIMIT 1
      ) pending ON true`, [identity.userId, identity.sessionId, identity.emailHash, config.OTP_RESEND_COOLDOWN_SECONDS]);
    const state = result.rows[0];
    if (Number(state?.retry_after_seconds ?? 0) > 0) throw new OtpChallengeError('OTP_RESEND_COOLDOWN', 429, Number(state.retry_after_seconds));
    if (!state?.id && Number(state?.hourly_count ?? 0) >= 10) throw new OtpChallengeError('OTP_HOURLY_LIMIT', 429, 3600);

    const id = state?.id ?? randomUUID();
    const validitySeconds = state?.id ? Number(state.validity_seconds) : config.OTP_VALIDITY_SECONDS;
    // Legacy pending drafts used the main sender. Never reinterpret an uncertain
    // old delivery as an owner-only request with a different provider payload.
    const senderFrom = state?.id ? state.sender_from ?? config.RESEND_FROM_EMAIL : requestedSender;
    if (state?.id) {
      const updated = await client.query(`UPDATE otp_challenges
        SET delivery_attempt_at = now(), retry_after_at = now() + interval '30 seconds', sender_from = COALESCE(sender_from, $5)
        WHERE id = $1 AND user_id = $2 AND session_id = $3 AND email_hash = $4
          AND delivery_state = 'pending' AND consumed_at IS NULL`, [id, identity.userId, identity.sessionId, identity.emailHash, senderFrom]);
      if (!updated.rowCount) throw new OtpChallengeError('OTP_CHALLENGE_REVOKED', 409);
    } else {
      // Retire abandoned drafts only. An already accepted code stays usable until
      // its replacement has been acknowledged and committed successfully.
      await client.query(`WITH retired AS (
        UPDATE otp_challenges SET consumed_at = now()
        WHERE user_id = $2 AND session_id = $3 AND delivery_state = 'pending' AND consumed_at IS NULL
      ) INSERT INTO otp_challenges
        (id, user_id, session_id, code_hash, email_hash, expires_at, validity_seconds, code_version, delivery_attempt_at, retry_after_at, sender_from)
        VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes', $6, 1, now(), now() + interval '30 seconds', $7)`,
      [id, identity.userId, identity.sessionId, otpCodeHash(identity.userId, identity.sessionId, identity.emailHash, challengeCode(identity, id)).toString('hex'), identity.emailHash, validitySeconds, senderFrom]);
    }
    await client.query('COMMIT');
    return { id, validitySeconds, providerMessageId: state?.provider_message_id ?? null, acceptedAt: state?.accepted_at ? new Date(state.accepted_at) : null, newlyCreated: !state?.id, senderFrom };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function finalizeOtpChallenge(database: Database, identity: OtpIdentity, lease: OtpLease, messageId: string, acknowledgedAt: Date): Promise<Date> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp-send:${identity.userId}`]);
    const result = await client.query<{
      delivery_state: string; consumed_at: Date | null; accepted_at: Date | null;
      expires_at: Date; validity_seconds: number; too_old: boolean;
    }>(`SELECT delivery_state, consumed_at, accepted_at, expires_at, validity_seconds,
        sent_at <= now() - interval '15 minutes' AS too_old
      FROM otp_challenges WHERE id = $1 AND user_id = $2 AND session_id = $3 AND email_hash = $4 FOR UPDATE`,
    [lease.id, identity.userId, identity.sessionId, identity.emailHash]);
    const row = result.rows[0];
    if (!row || row.consumed_at || !['pending', 'accepted'].includes(row.delivery_state)) throw new OtpChallengeError('OTP_CHALLENGE_REVOKED', 409);
    if (row.delivery_state === 'accepted') {
      // Parallel recovery of the same provider idempotency key never extends the
      // original lifetime or writes a second delivery audit event.
      await client.query('COMMIT');
      return new Date(row.expires_at);
    }
    const acceptedAt = row.accepted_at ? new Date(row.accepted_at) : acknowledgedAt;
    const expiresAt = new Date(acceptedAt.getTime() + Number(row.validity_seconds) * 1000);
    if (row.too_old || expiresAt.getTime() <= Date.now()) throw new OtpChallengeError('OTP_CHALLENGE_REVOKED', 409);
    await client.query(`WITH accepted AS (
      UPDATE otp_challenges
        SET delivery_state = 'accepted', provider_message_id = $2, accepted_at = $3, expires_at = $4,
          delivery_finished_at = now(), retry_after_at = $3::timestamptz + make_interval(secs => $5::int)
        WHERE id = $1 RETURNING id
    ), superseded AS (
      UPDATE otp_challenges SET consumed_at = now()
      WHERE user_id = $6 AND session_id = $7 AND id <> $1 AND delivery_state = 'accepted' AND consumed_at IS NULL
        AND EXISTS (SELECT 1 FROM accepted)
    ) INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
      SELECT $6, 'auth.otp_requested', 'otp_challenge', id FROM accepted`,
    [lease.id, messageId, acceptedAt, expiresAt, config.OTP_RESEND_COOLDOWN_SECONDS, identity.userId, identity.sessionId]);
    await client.query('COMMIT');
    return expiresAt;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

// A failed finalization must never label an acknowledged email as undelivered.
// Save its acknowledgement for a short-backoff, database-only retry when possible.
export async function retainOtpAcknowledgement(database: Pick<Pool, 'query'>, identity: OtpIdentity, lease: OtpLease, messageId: string, acceptedAt: Date) {
  await database.query(`UPDATE otp_challenges SET provider_message_id = COALESCE(provider_message_id, $2),
    accepted_at = COALESCE(accepted_at, $3), delivery_finished_at = now(), retry_after_at = now() + interval '2 seconds'
    WHERE id = $1 AND user_id = $4 AND session_id = $5 AND email_hash = $6
      AND delivery_state = 'pending' AND consumed_at IS NULL`,
  [lease.id, messageId, acceptedAt, identity.userId, identity.sessionId, identity.emailHash]);
}

export async function recordOtpDeliveryFailure(database: Pick<Pool, 'query'>, identity: OtpIdentity, lease: OtpLease, outcome: 'not_sent' | 'unknown', retryAfterSeconds: number) {
  await database.query(`WITH failed AS (
    UPDATE otp_challenges SET delivery_state = CASE WHEN $2::boolean THEN 'failed' ELSE 'pending' END,
      consumed_at = CASE WHEN $2::boolean THEN now() ELSE consumed_at END,
      delivery_finished_at = now(), retry_after_at = now() + make_interval(secs => $3::int)
    WHERE id = $1 AND user_id = $4 AND session_id = $5 AND email_hash = $6
      AND delivery_state = 'pending' AND consumed_at IS NULL AND provider_message_id IS NULL
    RETURNING id
  ) INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
    SELECT $4, CASE WHEN $2::boolean THEN 'auth.otp_send_failed' ELSE 'auth.otp_delivery_pending' END, 'otp_challenge', id FROM failed`,
  [lease.id, outcome === 'not_sent', retryAfterSeconds, identity.userId, identity.sessionId, identity.emailHash]);
}
