-- Preserve the state of pre-existing provider invitations. No email is sent and
-- no authentication record, password or role is changed by this migration.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND current_schema()='public' THEN
    INSERT INTO account_invitations(user_id,role,invited_at,accepted_at)
      SELECT p.id,p.role,u.invited_at,
        CASE WHEN COALESCE(u.encrypted_password,'')<>'' THEN COALESCE(u.email_confirmed_at,u.invited_at) END
      FROM profiles p JOIN auth.users u ON u.id=p.id
      LEFT JOIN account_status a ON a.user_id=p.id
      WHERE u.invited_at IS NOT NULL AND u.deleted_at IS NULL
        AND p.role IN ('patient','student','lecturer','staff','doctor','receptionist')
        AND a.deleted_at IS NULL ON CONFLICT(user_id) DO NOTHING;
  END IF;
END $$;
