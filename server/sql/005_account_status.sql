CREATE TABLE IF NOT EXISTS account_status (
  user_id uuid PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
