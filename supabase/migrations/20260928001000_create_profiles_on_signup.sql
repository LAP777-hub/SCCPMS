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
    id, role, email, full_name, phone, user_type,
    student_number, staff_number, department, program
  ) VALUES (
    NEW.id,
    'patient',
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    registered_type,
    NULLIF(NEW.raw_user_meta_data ->> 'student_number', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'staff_number', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'department', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'program', '')
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;