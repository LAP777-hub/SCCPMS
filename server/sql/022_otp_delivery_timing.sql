-- Delivery acknowledgement, resend leases and recoverable idempotent challenges.
-- Existing accepted codes keep their original expiry and existing verification
-- sessions are unchanged. Version 0 challenges cannot reconstruct a pending code.
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS delivery_attempt_at timestamptz;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS delivery_finished_at timestamptz;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS retry_after_at timestamptz;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS validity_seconds smallint
  CHECK (validity_seconds IS NULL OR validity_seconds BETWEEN 120 AND 900);
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS code_version smallint NOT NULL DEFAULT 0
  CHECK (code_version IN (0, 1))
  CHECK (code_version = 0 OR (validity_seconds IS NOT NULL AND email_hash IS NOT NULL AND delivery_attempt_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS otp_challenges_pending_session_idx
  ON otp_challenges(user_id, session_id, sent_at DESC)
  WHERE delivery_state = 'pending' AND consumed_at IS NULL;
