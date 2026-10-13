CREATE OR REPLACE FUNCTION notify_clinic_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('clinic_changes', TG_TABLE_NAME);
  RETURN NULL;
END;
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'appointments','doctor_availability_slots','doctor_leave_requests',
    'walk_ins','notifications','patient_visits','prescriptions','lab_orders',
    'clinic_doctors','clinic_settings','clinic_holidays','account_status','audit_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS clinic_change ON %I', table_name);
    EXECUTE format('CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION notify_clinic_change()', table_name);
  END LOOP;
END $$;
