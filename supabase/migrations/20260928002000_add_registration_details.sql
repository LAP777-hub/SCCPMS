ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_category text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS next_of_kin_name text,
  ADD COLUMN IF NOT EXISTS next_of_kin_relationship text,
  ADD COLUMN IF NOT EXISTS next_of_kin_phone text;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  registered_type text := NEW.raw_user_meta_data ->> 'user_type';
BEGIN
  IF registered_type NOT IN ('Student', 'Lecturer', 'SPU Staff') THEN
    registered_type := NULL;
  END IF;

  INSERT INTO public.profiles (
    id, role, email, full_name, phone, user_type, student_category,
    student_number, staff_number, department, program,
    address_line1, address_line2, city, province, postal_code,
    next_of_kin_name, next_of_kin_relationship, next_of_kin_phone
  ) VALUES (
    NEW.id,
    'patient',
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    registered_type,
    NULLIF(NEW.raw_user_meta_data ->> 'student_category', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'student_number', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'staff_number', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'department', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'program', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'address_line1', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'address_line2', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'city', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'province', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'postal_code', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'next_of_kin_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'next_of_kin_relationship', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'next_of_kin_phone', '')
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;