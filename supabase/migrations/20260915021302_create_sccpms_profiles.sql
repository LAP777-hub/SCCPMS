/*
# Create SCCPMS account profiles for role-based access

1. New Tables
- `profiles` stores the non-sensitive account details associated with each Supabase Auth user.
- `id` is the profile and auth user identifier.
- `role` identifies the account category: student, lecturer, or staff.
- `email`, `student_number`, `staff_number`, `department`, and `program` support the SCCPMS registration flow.
- `created_at` and `updated_at` record profile lifecycle timestamps.

2. Security
- Row Level Security is enabled on `profiles`.
- Authenticated users can only read, create, update, or delete their own profile.
- Profile access is tied to `auth.uid()` and never to user-editable metadata.

3. Important Notes
- Supabase Auth remains the source of truth for passwords and sessions.
- The role values are limited to the three account categories presented in the UI.
- This migration does not delete or alter existing user data.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('student', 'lecturer', 'staff')),
  email text NOT NULL,
  student_number text,
  staff_number text,
  department text,
  program text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;
CREATE POLICY "Users can create own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
ON public.profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
