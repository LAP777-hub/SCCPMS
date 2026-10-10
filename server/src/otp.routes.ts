import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import { sendOtpSms } from './sms.js';

const router = Router();
router.use(requireAuth);

function hashCode(userId: string, sessionId: string, code: string) {
  return createHmac('sha256', config.OTP_HMAC_SECRET)
    .update(`${userId}:${sessionId}:${code}`)
    .digest();
}

router.post('/send', async (req, res) => {
  const { userId, sessionId, phone } = req.auth!;
  if (!phone) return res.status(422).json({ error: 'A verified phone number is required on your profile.' });

  const client = await pool.connect();
  let challengeId: string | undefined;
  const code = randomInt(100000, 1000000).toString();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [userId, sessionId]);
    const recent = await client.query(
      `SELECT 1 FROM otp_challenges
       WHERE user_id = $1 AND session_id = $2 AND sent_at > now() - interval '60 seconds'
       LIMIT 1`,
      [userId, sessionId],
    );
    if (recent.rowCount) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Wait one minute before requesting another code.' });
    }

    await client.query(
      `UPDATE otp_challenges SET consumed_at = now()
       WHERE user_id = $1 AND session_id = $2 AND consumed_at IS NULL`,
      [userId, sessionId],
    );
    const result = await client.query<{ id: string }>(
      `INSERT INTO otp_challenges (user_id, session_id, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '5 minutes') RETURNING id`,
      [userId, sessionId, hashCode(userId, sessionId, code).toString('hex')],
    );
    challengeId = result.rows[0].id;
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to create a verification challenge.' });
  } finally {
    client.release();
  }

  try {
    await sendOtpSms(phone, code);
    return res.status(202).json({ message: 'A verification code was sent to your registered phone.' });
  } catch {
    await pool.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [challengeId]);
    return res.status(502).json({ error: 'The SMS provider could not deliver your code. Please try again later.' });
  }
});

router.post('/verify', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });

  const { userId, sessionId } = req.auth!;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      code_hash: string;
      attempts: number;
      expired: boolean;
    }>(
      `SELECT id, code_hash, attempts, expires_at <= now() AS expired
       FROM otp_challenges
       WHERE user_id = $1 AND session_id = $2 AND consumed_at IS NULL
       ORDER BY sent_at DESC LIMIT 1 FOR UPDATE`,
      [userId, sessionId],
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

    const actual = hashCode(userId, sessionId, code);
    const expected = Buffer.from(challenge.code_hash, 'hex');
    const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!matches) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
      await client.query('COMMIT');
      return res.status(401).json({ error: 'The verification code is incorrect.' });
    }

    await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
    await client.query(
      `INSERT INTO otp_verified_sessions (user_id, session_id, expires_at)
       VALUES ($1, $2, now() + interval '12 hours')
       ON CONFLICT (user_id, session_id)
       DO UPDATE SET verified_at = now(), expires_at = EXCLUDED.expires_at`,
      [userId, sessionId],
    );
    if (req.auth!.role === 'doctor') {
      await client.query('UPDATE clinic_doctors SET active = true, updated_at = now() WHERE user_id = $1', [userId]);
    }
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type)
       VALUES ($1, 'auth.otp_verified', 'session')`,
      [userId],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Verification successful.' });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(503).json({ error: 'Unable to verify this code right now.' });
  } finally {
    client.release();
  }
});

export default router;