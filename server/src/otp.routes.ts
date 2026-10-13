import { randomInt, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Router, type Request, type Response } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { sendOtpEmail, EmailDeliveryError } from './email.js';
import { otpCodeHash, otpEmailHash } from './otp-security.js';
import { maskEmailAddress } from './email-address.js';
import { logger } from './logger.js';

const router = Router();
router.use(requireAuth);

// Verification belongs to the server-side auth session, not browser state.
export async function getOtpStatus(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT 1 FROM otp_verified_sessions
       WHERE user_id = $1 AND session_id = $2 AND email_hash = $3 AND expires_at > now()`,
      [req.auth!.userId, req.auth!.sessionId, otpEmailHash(req.auth!.userId, req.auth!.email)],
    );
    return res.json({ verified: Boolean(result.rowCount) });
  } catch {
    return res.status(503).json({ error: 'Unable to verify your authentication state.' });
  }
}
router.get('/status', getOtpStatus);

router.post('/send', async (req, res) => {
  const { userId, sessionId, email } = req.auth!;
  const emailHash = otpEmailHash(userId, email);
  if (!emailHash) return res.status(422).json({ error: 'A confirmed email address is required on your account. Contact the clinic administrator.' });

  let client: PoolClient | undefined;
  let challengeId: string | undefined;
  const code = randomInt(100000, 1000000).toString();
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Applies across browser sessions and API instances, including concurrent sends.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp-send:${userId}`]);
    const recent = await client.query(
      `SELECT 1 FROM otp_challenges
       WHERE user_id = $1 AND sent_at > now() - interval '60 seconds'
       LIMIT 1`,
      [userId],
    );
    if (recent.rowCount) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Wait one minute before requesting another code.' });
    }
    const hourly = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM otp_challenges WHERE user_id = $1 AND sent_at > now() - interval '1 hour'`, [userId],
    );
    if (Number(hourly.rows[0]?.count ?? 0) >= 10) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Too many email code requests. Wait one hour before requesting another code.' });
    }

    await client.query(
      `UPDATE otp_challenges SET consumed_at = now()
       WHERE user_id = $1 AND session_id = $2 AND consumed_at IS NULL`,
      [userId, sessionId],
    );
    const result = await client.query<{ id: string }>(
      `INSERT INTO otp_challenges (user_id, session_id, code_hash, email_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '5 minutes') RETURNING id`,
      [userId, sessionId, otpCodeHash(userId, sessionId, emailHash, code).toString('hex'), emailHash],
    );
    challengeId = result.rows[0].id;
    await client.query('COMMIT');
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to create a verification challenge.' });
  } finally {
    client?.release();
  }

  try {
    const delivery = await sendOtpEmail(email, code, challengeId!);
    await pool.query(`UPDATE otp_challenges SET delivery_state = 'accepted', provider_message_id = $2 WHERE id = $1`, [challengeId, delivery.messageId]);
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'auth.otp_requested', 'otp_challenge', $2)`, [userId, challengeId]);
    return res.status(202).json({
      message: `A verification email was sent to ${maskEmailAddress(email)}. Check your inbox and spam folder. The code expires in five minutes.`,
      deliveryMode: 'email',
      destination: maskEmailAddress(email),
      expiresInSeconds: 300,
    });
  } catch (error) {
    const reason = error instanceof EmailDeliveryError ? error.reason : 'database';
    const statusCode = error instanceof EmailDeliveryError ? error.statusCode : undefined;
    logger.warn('OTP email request failed', { requestId: req.id, reason, statusCode });
    await pool.query("UPDATE otp_challenges SET consumed_at = now(), delivery_state = 'failed' WHERE id = $1", [challengeId]).catch(() => undefined);
    await pool.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'auth.otp_send_failed', 'otp_challenge', $2)`, [userId, challengeId]).catch(() => undefined);
    if (reason === 'configuration') return res.status(503).json({ error: 'Email verification is not configured. Contact the clinic administrator.' });
    return res.status(502).json({ error: 'The email provider could not send your code. Please try again later.' });
  }
});

router.post('/verify', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });

  const { userId, sessionId } = req.auth!;
  const emailHash = otpEmailHash(userId, req.auth!.email);
  if (!emailHash) return res.status(422).json({ error: 'A confirmed email address is required. Contact the clinic administrator.' });
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
       ORDER BY sent_at DESC LIMIT 1 FOR UPDATE`,
      [userId, sessionId, emailHash],
    );
    const challenge = result.rows[0];
    if (!challenge) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No active code found. Request a new one.' });
    }
    if (challenge.expired) {
      await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
      await client.query('COMMIT');
      return res.status(410).json({ error: 'This code has expired. Request a new one.' });
    }
    if (challenge.attempts >= 5) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const actual = otpCodeHash(userId, sessionId, emailHash, code);
    const expected = Buffer.from(challenge.code_hash, 'hex');
    const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!matches) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
      await client.query('COMMIT');
      return res.status(401).json({ error: 'The verification code is incorrect.' });
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
    return res.json({ message: 'Verification successful.' });
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to verify this code right now.' });
  } finally {
    client?.release();
  }
});

export default router;
