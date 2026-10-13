-- Verification lasts for its authenticated session, without an inactivity or
-- separate dashboard time limit. Logout deletes the session; account/email
-- checks continue on every protected request. Expired/unverified sessions stay denied.
UPDATE otp_verified_sessions
SET expires_at = 'infinity'::timestamptz
WHERE email_hash IS NOT NULL AND expires_at > now();
