-- A missed appointment releases the doctor's time just as it releases the patient.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='appointments'::regclass AND contype='x'
      AND pg_get_constraintdef(oid) LIKE '%doctor_id WITH =%'
  LOOP
    EXECUTE format('ALTER TABLE appointments DROP CONSTRAINT %I',constraint_name);
  END LOOP;
  ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_no_overlap
    EXCLUDE USING gist (doctor_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE (status NOT IN ('cancelled','no_show'));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS walk_ins_one_active_patient_idx
  ON walk_ins (patient_user_id)
  WHERE patient_user_id IS NOT NULL AND status NOT IN ('completed','cancelled');
