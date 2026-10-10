ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_type text;

UPDATE public.profiles
SET user_type = CASE role
  WHEN 'student' THEN 'Student'
  WHEN 'lecturer' THEN 'Lecturer'
  WHEN 'staff' THEN 'SPU Staff'
  ELSE user_type
END
WHERE role IN ('student', 'lecturer', 'staff')
  AND user_type IS NULL;

UPDATE public.profiles
SET role = 'patient'
WHERE role IN ('student', 'lecturer', 'staff');