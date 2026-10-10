-- Create profiles table for additional user information
-- This table stores extended profile data beyond Supabase Auth

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'patient' CHECK (role IN ('admin', 'doctor', 'patient', 'receptionist', 'student', 'lecturer', 'staff')),
  phone text,
  user_type text CHECK (user_type IN ('Student', 'Lecturer', 'SPU Staff')),
  student_number text,
  staff_number text,
  department text,
  program text,
  address_line1 text,
  address_line2 text,
  city text,
  province text,
  postal_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
CREATE INDEX IF NOT EXISTS profiles_user_type_idx ON profiles(user_type);