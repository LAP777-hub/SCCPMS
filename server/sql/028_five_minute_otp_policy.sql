-- The current login policy permits a code for five minutes from acceptance.
-- Pending payloads carry a frozen duration for provider-idempotent replay; do
-- not edit or resend an older payload with a new duration under the same key.
-- Already verified sessions and clinical/account records are unchanged.
ALTER TABLE otp_challenges ALTER COLUMN validity_seconds SET DEFAULT 300;

WITH retired AS (
  UPDATE otp_challenges
  SET delivery_state = 'failed', consumed_at = now(),
      delivery_finished_at = now(), retry_after_at = now()
  WHERE delivery_state = 'pending' AND consumed_at IS NULL
    AND validity_seconds IS DISTINCT FROM 300
  RETURNING id, user_id
), shortened AS (
  UPDATE otp_challenges
  SET expires_at = COALESCE(accepted_at, sent_at) + interval '5 minutes'
  WHERE delivery_state = 'accepted' AND consumed_at IS NULL
    AND expires_at > COALESCE(accepted_at, sent_at) + interval '5 minutes'
  RETURNING id, user_id
)
INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
SELECT user_id, 'auth.otp_five_minute_policy', 'otp_challenge', id FROM retired
UNION ALL
SELECT user_id, 'auth.otp_five_minute_policy', 'otp_challenge', id FROM shortened;
