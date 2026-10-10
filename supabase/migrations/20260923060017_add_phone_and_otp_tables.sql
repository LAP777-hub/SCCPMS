/*
# Add phone column to profiles and create OTP verification table

1. Modified Tables
- `profiles` now has a `phone` text column (nullable) to store the user's cellphone number for OTP delivery.
- `profiles` now has a `full_name` text column (nullable) to store the user's display name.
- Existing rows are preserved; new columns default to NULL.

2. New Tables
- `otp_codes` stores one-time passwords for two-factor verification.
- `id` (uuid, primary key).
- `user_id` (uuid, references auth.users) identifies whose OTP this is.
- `code_hash` (text) stores a bcrypt-style hash of the 6-digit code (never the plain code).
- `phone` (text) records the phone number the OTP was sent to.
- `expires_at` (timestamptz) — OTP is valid for 5 minutes.
- `verified` (boolean, default false) — set true once the user successfully verifies.
- `attempts` (int, default 0) — tracks failed verification attempts (max 5).
- `created_at` (timestamptz).

3. Security
- RLS enabled on `otp_codes`.
- Users can only read, insert, update, and delete their own OTP rows (auth.uid() = user_id).
- The `otp_codes` table is the only durable store for OTP state — no in-memory caching.

4. Important Notes
- The OTP edge function generates a 6-digit code, hashes it, stores the hash in `otp_codes`, and returns the code (for demo/SMS gateway integration).
- The edge function verifies by comparing the submitted code against the stored hash.
- Phone numbers are stored in profiles for the admin to manage when registering doctors/receptionists.
*/

-- Add phone and full_name columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS full_name text;

-- Create OTP codes table
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  phone text,
  expires_at timestamptz NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own otp" ON public.otp_codes;
CREATE POLICY "Users can read own otp"
ON public.otp_codes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own otp" ON public.otp_codes;
CREATE POLICY "Users can insert own otp"
ON public.otp_codes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own otp" ON public.otp_codes;
CREATE POLICY "Users can update own otp"
ON public.otp_codes FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own otp" ON public.otp_codes;
CREATE POLICY "Users can delete own otp"
ON public.otp_codes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS otp_codes_user_id_idx ON public.otp_codes(user_id);
CREATE INDEX IF NOT EXISTS otp_codes_expires_at_idx ON public.otp_codes(expires_at);
