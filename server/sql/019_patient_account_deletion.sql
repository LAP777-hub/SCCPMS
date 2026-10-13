-- Keep clinic identities and history while irreversibly deleting Auth credentials.
-- A committed request prevents reactivation if the external Auth call needs retry.
ALTER TABLE account_status
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Free the unique operational email for a later registration without losing
-- the former patient's original contact address from retained history.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_email text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'account_status'::regclass AND conname = 'account_status_deletion_inactive') THEN
    ALTER TABLE account_status ADD CONSTRAINT account_status_deletion_inactive
      CHECK (deletion_requested_at IS NULL OR NOT active);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'account_status'::regclass AND conname = 'account_status_deletion_complete') THEN
    ALTER TABLE account_status ADD CONSTRAINT account_status_deletion_complete
      CHECK (deleted_at IS NULL OR (deletion_requested_at IS NOT NULL AND deleted_by IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_status_pending_deletion_idx
  ON account_status (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL;
