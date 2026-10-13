CREATE TABLE IF NOT EXISTS clinical_visit_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits(id),
  actor_user_id uuid NOT NULL,
  previous_record jsonb NOT NULL,
  revised_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_revisions_visit_idx ON clinical_visit_revisions(visit_id,created_at DESC);
CREATE OR REPLACE FUNCTION preserve_visit_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO clinical_visit_revisions(visit_id,actor_user_id,previous_record,revised_record)
  VALUES (OLD.id,NEW.doctor_user_id,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS preserve_revision ON patient_visits;
CREATE TRIGGER preserve_revision AFTER UPDATE ON patient_visits
FOR EACH ROW EXECUTE FUNCTION preserve_visit_revision();
ALTER TABLE clinical_visit_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinical_visit_revisions FROM anon, authenticated;
