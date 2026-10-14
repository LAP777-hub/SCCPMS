import { timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Router, type Request, type Response } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { sendOtpEmail, EmailDeliveryError } from './email.js';
import { otpCodeHash, otpEmailHash } from './otp-security.js';
import { maskEmailAddress } from './email-address.js';
import { logger } from './logger.js';
import { config } from './config.js';
import {
  challengeCode, finalizeOtpChallenge, OtpChallengeError, readOtpState,
  recordOtpDeliveryFailure, reserveOtpChallenge, retainOtpAcknowledgement,
  type OtpIdentity, type OtpLease,
} from './otp-challenges.js';

const router = Router();
router.use(requireAuth);

function responseEnded(res: Response) { return res.headersSent || res.writableEnded || res.destroyed; }
function otpResponse(res: Response, status: number, payload: object) {
  return responseEnded(res) ? res : res.status(status).json(payload);
}

// Verification belongs to the server-side auth session, not browser state.
function activeChallenge(expiresAt: Date | null, email: string) {
  if (!expiresAt || expiresAt.getTime() <= Date.now()) return null;
  return { destination: maskEmailAddress(email), expiresAt: expiresAt.toISOString(), expiresInSeconds: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) };
}

export async function getOtpStatus(req: Request, res: Response) {
  if (responseEnded(res)) return res;
  const { userId, sessionId, email } = req.auth!;
  const emailHash = otpEmailHash(userId, email);
  if (!emailHash) return otpResponse(res, 422, { error: 'A confirmed email address is required. Contact the clinic administrator.' });
  try {
    const state = await readOtpState(pool, { userId, sessionId, emailHash });
    return otpResponse(res, 200, { verified: state.verified, activeChallenge: activeChallenge(state.activeExpiresAt, email), retryAfterSeconds: state.retryAfterSeconds });
  } catch {
    return otpResponse(res, 503, { error: 'Unable to verify your authentication state.' });
  }
}
router.get('/status', getOtpStatus);

async function otpProblem(res: Response, status: number, code: string, error: string, retryAfterSeconds: number, identity: OtpIdentity, email: string, readState = true) {
  if (responseEnded(res)) return res;
  let challenge: ReturnType<typeof activeChallenge> | undefined;
  if (readState) {
    try { challenge = activeChallenge((await readOtpState(pool, identity)).activeExpiresAt, email); } catch { /* Keep the client's previously acknowledged timer when the database is unavailable. */ }
  }
  return otpResponse(res, status, { error, code, retryAfterSeconds, ...(challenge !== undefined ? { activeChallenge: challenge } : {}) });
}

router.post('/send', async (req, res) => {
  if (responseEnded(res)) return res;
  const { userId, sessionId, email } = req.auth!;
  const emailHash = otpEmailHash(userId, email);
  if (!emailHash) return otpResponse(res, 422, { error: 'A confirmed email address is required on your account. Contact the clinic administrator.' });

  const identity = { userId, sessionId, emailHash };
  let lease: OtpLease;
  try {
    lease = await reserveOtpChallenge(pool, identity);
  } catch (error) {
    if (error instanceof OtpChallengeError) {
      const message = error.code === 'OTP_HOURLY_LIMIT'
        ? 'Too many email code requests. Wait one hour before requesting another code.'
        : error.code === 'OTP_RESEND_COOLDOWN'
          ? `Wait ${error.retryAfterSeconds} seconds before requesting another code.`
          : 'This verification request is no longer active. Request a new code.';
      return otpProblem(res, error.status, error.code, message, error.retryAfterSeconds, identity, email);
    }
    return otpResponse(res, 503, { error: 'Unable to create a verification challenge.' });
  }

  if (responseEnded(res)) {
    // The caller has already received a timeout. Do not start a new email.
    // A replay may have an older uncertain/known acknowledgement, so only a
    // freshly created draft can be safely labelled as never sent.
    if (lease.providerMessageId && lease.acceptedAt) {
      await retainOtpAcknowledgement(pool, identity, lease, lease.providerMessageId, lease.acceptedAt).catch(() => undefined);
    } else {
      await recordOtpDeliveryFailure(pool, identity, lease, lease.newlyCreated ? 'not_sent' : 'unknown', 2).catch(() => undefined);
    }
    return res;
  }

  // The provider call happens after the reservation transaction has released its
  // connection and lock. Replays use the same code, payload duration and key.
  let messageId = lease.providerMessageId;
  let acknowledgedAt = lease.acceptedAt;
  try {
    if (!messageId || !acknowledgedAt) {
      const delivery = await sendOtpEmail(email, challengeCode(identity, lease.id), lease.id, config, lease.validitySeconds);
      messageId = delivery.messageId;
      acknowledgedAt = new Date();
    }
  } catch (error) {
    const reason = error instanceof EmailDeliveryError ? error.reason : 'database';
    const statusCode = error instanceof EmailDeliveryError ? error.statusCode : undefined;
    logger.warn('OTP email request failed', { requestId: req.id, reason, statusCode });
    const outcome = error instanceof EmailDeliveryError ? error.deliveryOutcome : 'unknown';
    const retryAfterSeconds = Math.max(2, Math.min(3600, error instanceof EmailDeliveryError ? error.retryAfterSeconds ?? 2 : 2));
    let persisted = true;
    await recordOtpDeliveryFailure(pool, identity, lease, outcome, retryAfterSeconds).catch(() => { persisted = false; });
    if (reason === 'configuration') return otpProblem(res, 503, 'OTP_EMAIL_UNAVAILABLE', 'Email verification is not configured. Contact the clinic administrator.', retryAfterSeconds, identity, email, persisted);
    if (reason === 'sender_unverified' || reason === 'authentication' || reason === 'quota_exceeded') {
      return otpProblem(res, 503, 'OTP_EMAIL_UNAVAILABLE', 'Email verification is temporarily unavailable. Contact the clinic administrator.', retryAfterSeconds, identity, email, persisted);
    }
    if (outcome === 'unknown') return otpProblem(res, 502, 'OTP_DELIVERY_PENDING', 'Delivery could not yet be confirmed. Check your inbox, then retry; the same code will be used.', retryAfterSeconds, identity, email, persisted);
    return otpProblem(res, reason === 'rate_limited' ? 429 : 502, 'OTP_EMAIL_FAILED', 'The email provider could not send your code. Please try again shortly.', retryAfterSeconds, identity, email, persisted);
  }

  try {
    const expiresAt = await finalizeOtpChallenge(pool, identity, lease, messageId, acknowledgedAt);
    return otpResponse(res, 202, {
      message: `A verification email was sent to ${maskEmailAddress(email)}. Check your inbox and spam folder.`,
      deliveryMode: 'email', destination: maskEmailAddress(email), expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
      retryAfterSeconds: Math.max(0, Math.ceil((expiresAt.getTime() - lease.validitySeconds * 1000 + config.OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000)),
    });
  } catch (error) {
    if (error instanceof OtpChallengeError) return otpProblem(res, error.status, error.code, 'This verification request is no longer active. Request a new code.', 0, identity, email);
    logger.warn('OTP delivery acknowledgement could not be committed', { requestId: req.id, reason: 'database' });
    let retained = true;
    await retainOtpAcknowledgement(pool, identity, lease, messageId, acknowledgedAt).catch(() => { retained = false; });
    return otpProblem(res, 503, 'OTP_DELIVERY_PENDING', 'Your verification email was accepted, but verification is still being prepared. Retry shortly; the same code will be used.', 2, identity, email, retained);
  }
});

router.post('/verify', async (req, res) => {
  if (responseEnded(res)) return res;
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!/^\d{6}$/.test(code)) return otpResponse(res, 400, { error: 'Enter the six-digit verification code.' });

  const { userId, sessionId } = req.auth!;
  const emailHash = otpEmailHash(userId, req.auth!.email);
  if (!emailHash) return otpResponse(res, 422, { error: 'A confirmed email address is required. Contact the clinic administrator.' });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      code_hash: string;
      attempts: number;
      expired: boolean;
    }>(
      `SELECT id, code_hash, attempts, expires_at <= now() AS expired
       FROM otp_challenges
       WHERE user_id = $1 AND session_id = $2 AND email_hash = $3 AND delivery_state = 'accepted' AND consumed_at IS NULL
       ORDER BY COALESCE(accepted_at, sent_at) DESC LIMIT 1 FOR UPDATE`,
      [userId, sessionId, emailHash],
    );
    const challenge = result.rows[0];
    if (!challenge) {
      await client.query('ROLLBACK');
      return otpResponse(res, 404, { error: 'No active code found. Request a new one.' });
    }
    if (challenge.expired) {
      await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
      await client.query('COMMIT');
      return otpResponse(res, 410, { error: 'This code has expired. Request a new one.' });
    }
    if (challenge.attempts >= 5) {
      await client.query('ROLLBACK');
      return otpResponse(res, 429, { error: 'Too many incorrect attempts. Request a new code.' });
    }

    const actual = otpCodeHash(userId, sessionId, emailHash, code);
    const expected = Buffer.from(challenge.code_hash, 'hex');
    const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!matches) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
      await client.query('COMMIT');
      return otpResponse(res, 401, { error: 'The verification code is incorrect.' });
    }

    await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
    await client.query(
      `INSERT INTO otp_verified_sessions (user_id, session_id, email_hash, expires_at)
       VALUES ($1, $2, $3, 'infinity'::timestamptz)
       ON CONFLICT (user_id, session_id)
       DO UPDATE SET verified_at = now(), email_hash = EXCLUDED.email_hash, expires_at = EXCLUDED.expires_at`,
      [userId, sessionId, emailHash],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type)
       VALUES ($1, 'auth.otp_verified', 'session')`,
      [userId],
    );
    await client.query('COMMIT');
    return otpResponse(res, 200, { message: 'Verification successful.' });
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    return otpResponse(res, 503, { error: 'Unable to verify this code right now.' });
  } finally {
    client?.release();
  }
});

export default router;
