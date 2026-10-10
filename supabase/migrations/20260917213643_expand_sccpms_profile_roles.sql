/*
# Expand SCCPMS profile roles for the four dashboard areas

1. Modified Tables
- `profiles.role` now accepts `admin`, `doctor`, `patient`, and `receptionist` in addition to the earlier student, lecturer, and staff values.
- Existing profile rows are preserved and remain valid.

2. Security
- The existing row-level security policies are unchanged.
- Role access continues to be checked after authentication rather than from user-editable metadata.

3. Important Notes
- Public self-registration still presents the patient-oriented account choices only.
- Admin, doctor, and receptionist accounts can be provisioned separately and can sign in through the matching role selector.
- No profile data is deleted or rewritten.
*/

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'doctor', 'patient', 'receptionist', 'student', 'lecturer', 'staff'));
