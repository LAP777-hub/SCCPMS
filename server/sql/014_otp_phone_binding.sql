-- Legacy verifications have no phone binding and require a fresh OTP. Accounts,
-- passwords and clinical data are unchanged. Do not backfill unverifiable claims.
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS phone_hash text
  CHECK (phone_hash IS NULL OR phone_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS delivery_state text NOT NULL DEFAULT 'pending'
  CHECK (delivery_state IN ('pending', 'accepted', 'failed'));
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE otp_verified_sessions ADD COLUMN IF NOT EXISTS phone_hash text
  CHECK (phone_hash IS NULL OR phone_hash ~ '^[a-f0-9]{64}$');
CREATE INDEX IF NOT EXISTS otp_challenges_user_sent_idx ON otp_challenges(user_id, sent_at DESC);
