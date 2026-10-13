-- Email verification replaces phone verification. Preserve earlier migrations
-- and history; old phone-bound sessions cannot grant email verification.
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS email_hash text
  CHECK (email_hash IS NULL OR email_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE otp_verified_sessions ADD COLUMN IF NOT EXISTS email_hash text
  CHECK (email_hash IS NULL OR email_hash ~ '^[a-f0-9]{64}$');
