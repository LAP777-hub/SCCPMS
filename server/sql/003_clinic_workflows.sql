CREATE TABLE IF NOT EXISTS clinic_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  opens_at time NOT NULL DEFAULT '08:00',
  closes_at time NOT NULL DEFAULT '17:15',
  default_appointment_minutes smallint NOT NULL DEFAULT 30 CHECK (default_appointment_minutes BETWEEN 10 AND 30),
  minimum_reschedule_notice_hours smallint NOT NULL DEFAULT 24 CHECK (minimum_reschedule_notice_hours BETWEEN 0 AND 168),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

INSERT INTO clinic_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS clinic_holidays (
  holiday_date date PRIMARY KEY,
  title text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES clinic_doctors(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked', 'blocked')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'blocked')
);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS availability_slot_id uuid REFERENCES doctor_availability_slots(id),
  ADD COLUMN IF NOT EXISTS reschedule_count smallint NOT NULL DEFAULT 0 CHECK (reschedule_count BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE TABLE IF NOT EXISTS appointment_reschedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  actor_user_id uuid NOT NULL,
  old_slot_id uuid REFERENCES doctor_availability_slots(id),
  new_slot_id uuid NOT NULL REFERENCES doctor_availability_slots(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_reschedule_actor_created_idx
  ON appointment_reschedule_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS availability_slots_doctor_time_idx
  ON doctor_availability_slots (doctor_id, starts_at) WHERE status = 'available';

CREATE TABLE IF NOT EXISTS patient_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid UNIQUE REFERENCES appointments(id),
  patient_user_id uuid NOT NULL,
  doctor_user_id uuid NOT NULL,
  recorded_by uuid NOT NULL,
  visit_date timestamptz NOT NULL DEFAULT now(),
  chief_complaint text NOT NULL CHECK (length(chief_complaint) BETWEEN 1 AND 4000),
  history text,
  examination text,
  assessment text,
  plan text,
  temperature_c numeric(4,1),
  blood_pressure_systolic smallint CHECK (blood_pressure_systolic BETWEEN 40 AND 300),
  blood_pressure_diastolic smallint CHECK (blood_pressure_diastolic BETWEEN 20 AND 200),
  heart_rate smallint CHECK (heart_rate BETWEEN 20 AND 250),
  respiratory_rate smallint CHECK (respiratory_rate BETWEEN 5 AND 80),
  oxygen_saturation numeric(4,1) CHECK (oxygen_saturation BETWEEN 0 AND 100),
  weight_kg numeric(6,2) CHECK (weight_kg BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_visits_patient_date_idx
  ON patient_visits (patient_user_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS patient_visits_doctor_date_idx
  ON patient_visits (doctor_user_id, visit_date DESC);

CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits(id),
  patient_user_id uuid NOT NULL,
  prescribed_by uuid NOT NULL,
  medication text NOT NULL CHECK (length(medication) BETWEEN 1 AND 200),
  dosage text NOT NULL CHECK (length(dosage) BETWEEN 1 AND 200),
  route text,
  frequency text NOT NULL,
  duration text NOT NULL,
  quantity text,
  instructions text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discontinued', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prescriptions_patient_created_idx
  ON prescriptions (patient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits(id),
  patient_user_id uuid NOT NULL,
  ordered_by uuid NOT NULL,
  test_name text NOT NULL CHECK (length(test_name) BETWEEN 1 AND 200),
  clinical_indication text,
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'collected', 'processing', 'resulted', 'cancelled')),
  result_summary text,
  resulted_by uuid,
  resulted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_orders_patient_created_idx
  ON lab_orders (patient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS walk_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid,
  patient_name text NOT NULL,
  contact_phone text,
  reason text NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'emergency')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'triaged', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_doctor_id uuid REFERENCES clinic_doctors(id),
  checked_in_by uuid NOT NULL,
  arrived_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS walk_ins_queue_idx
  ON walk_ins (status, urgency, arrived_at);

CREATE TABLE IF NOT EXISTS doctor_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_user_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'emergency', 'personal')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS doctor_leave_requests_doctor_idx
  ON doctor_leave_requests (doctor_user_id, starts_on DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
  ON audit_events (actor_user_id, created_at DESC);