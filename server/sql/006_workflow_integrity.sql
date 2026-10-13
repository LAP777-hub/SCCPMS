-- Database constraints protect schedules even when two requests race.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='appointments'::regclass AND conname='appointments_patient_no_overlap') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_patient_no_overlap
      EXCLUDE USING gist (patient_user_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
      WHERE (status NOT IN ('cancelled','no_show'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='doctor_leave_requests'::regclass AND conname='approved_leave_no_overlap') THEN
    ALTER TABLE doctor_leave_requests ADD CONSTRAINT approved_leave_no_overlap
      EXCLUDE USING gist (doctor_user_id WITH =, daterange(starts_on,ends_on,'[]') WITH &&)
      WHERE (status='approved');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leave_approved_lookup_idx
  ON doctor_leave_requests (doctor_user_id,starts_on,ends_on) WHERE status='approved';
CREATE INDEX IF NOT EXISTS appointments_slot_idx ON appointments (availability_slot_id);
CREATE INDEX IF NOT EXISTS walk_ins_assigned_active_idx
  ON walk_ins (assigned_doctor_id) WHERE status NOT IN ('completed','cancelled');
