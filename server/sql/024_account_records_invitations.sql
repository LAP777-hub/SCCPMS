-- Deleted profile identities remain for clinical FKs; reinvitations create a
-- separately authorized login and never transfer historical patient records.
CREATE TABLE IF NOT EXISTS account_reinvitations (
  old_user_id uuid PRIMARY KEY REFERENCES profiles(id),
  new_user_id uuid NOT NULL UNIQUE REFERENCES profiles(id),
  invited_by uuid NOT NULL,
  invited_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_invitations (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by uuid,
  role text NOT NULL CHECK(role IN ('patient','student','lecturer','staff','doctor','receptionist')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
ALTER TABLE account_reinvitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_reinvitations,account_invitations FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON account_reinvitations,account_invitations FROM %I',role_name);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON account_reinvitations,account_invitations TO service_role;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['account_reinvitations','account_invitations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS clinic_change ON %I',role_name);
    EXECUTE format('CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION notify_clinic_change()',role_name);
  END LOOP;
END $$;
