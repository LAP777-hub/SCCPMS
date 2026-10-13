ALTER TABLE walk_ins ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id);
CREATE UNIQUE INDEX IF NOT EXISTS walk_ins_appointment_idx
  ON walk_ins (appointment_id) WHERE appointment_id IS NOT NULL;
