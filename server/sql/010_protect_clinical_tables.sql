-- Clinical data and OTP state are accessed through the role/OTP-checked API.
-- Supabase's browser roles must not bypass that API via the public REST schema.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'otp_challenges','otp_verified_sessions','otp_codes','clinic_doctors',
    'appointments','appointment_reschedule_events','doctor_availability_slots',
    'doctor_leave_requests','clinic_settings','clinic_holidays','notifications',
    'patient_visits','prescriptions','lab_orders','walk_ins','account_status',
    'audit_events','schema_migrations'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;
