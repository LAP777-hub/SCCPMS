-- Retain the exact sender with a pending challenge so delivery retries reuse
-- the original provider request even when deployment settings change.
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS sender_from text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='otp_challenges'::regclass AND conname='otp_challenges_sender_from_valid') THEN
    ALTER TABLE otp_challenges ADD CONSTRAINT otp_challenges_sender_from_valid
      CHECK (sender_from IS NULL OR (length(sender_from) BETWEEN 1 AND 320 AND sender_from !~ E'[\r\n]'));
  END IF;
END $$;
