CREATE TABLE IF NOT EXISTS request_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  request_id text,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_audit_created_idx ON request_audit_logs(created_at DESC);
ALTER TABLE request_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON request_audit_logs FROM anon, authenticated;
