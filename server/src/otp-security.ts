import { createHmac } from 'node:crypto';
import { config } from './config.js';
import { normalizeEmailAddress } from './email-address.js';

// A keyed fingerprint binds verification to the trusted account email without
// storing an additional plaintext mailbox in the challenge/session tables.
export function otpEmailHash(userId: string, email: string | null | undefined): string | null {
  const normalized = normalizeEmailAddress(email);
  return normalized ? createHmac('sha256', config.OTP_HMAC_SECRET)
    .update(`otp-email:${userId}:${normalized}`).digest('hex') : null;
}

export function otpCodeHash(userId: string, sessionId: string, emailHash: string, code: string): Buffer {
  return createHmac('sha256', config.OTP_HMAC_SECRET)
    .update(`otp-code:${userId}:${sessionId}:${emailHash}:${code}`).digest();
}
