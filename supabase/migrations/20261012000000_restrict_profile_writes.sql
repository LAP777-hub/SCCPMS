-- Apply in the connected Supabase database used for Auth and clinic records.
-- Authorization and OTP phone also use server-managed app_metadata claims.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', item.policyname);
  END LOOP;
END $$;
CREATE POLICY "Users can read their own clinic profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
