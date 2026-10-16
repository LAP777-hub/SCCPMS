-- Run once at the Resend-to-Brevo cutover before enabling non-admin delivery.
-- Provider-local idempotency keys cannot safely replay an uncertain old draft
-- through a different provider, even when both providers use the same sender.
-- Accepted codes, known provider acknowledgements and admin drafts stay intact.
WITH retired AS (
  UPDATE otp_challenges AS challenge
  SET delivery_state = 'failed',
      consumed_at = now(),
      delivery_finished_at = now(),
      retry_after_at = now()
  FROM profiles AS profile
  WHERE profile.id = challenge.user_id
    AND profile.role <> 'admin'
    AND challenge.delivery_state = 'pending'
    AND challenge.consumed_at IS NULL
    AND challenge.provider_message_id IS NULL
    AND challenge.accepted_at IS NULL
  RETURNING challenge.id, challenge.user_id
)
INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
SELECT user_id, 'auth.otp_provider_cutover', 'otp_challenge', id
FROM retired;
