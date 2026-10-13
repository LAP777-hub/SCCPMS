-- Shared request counters survive Vercel instance changes. Keys are HMAC digests.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key text PRIMARY KEY,
  hits integer NOT NULL CHECK (hits >= 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS api_rate_limits_reset_idx ON api_rate_limits(reset_at);
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON api_rate_limits FROM PUBLIC, anon, authenticated;

-- Provider budget is shared by all instances, not multiplied by scale-out.
CREATE TABLE IF NOT EXISTS address_provider_budget (
  provider_key text PRIMARY KEY,
  budget_day date NOT NULL,
  requests integer NOT NULL CHECK (requests >= 0),
  next_request_at timestamptz NOT NULL
);
ALTER TABLE address_provider_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON address_provider_budget FROM PUBLIC, anon, authenticated;
