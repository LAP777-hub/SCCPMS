-- Durable invalidation metadata for independently scaled serverless streams.
-- Clinical content, account IDs and OTP values never enter this table.
CREATE TABLE IF NOT EXISTS clinic_change_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL CHECK (length(table_name) BETWEEN 1 AND 63),
  transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS clinic_change_events_transaction_idx
  ON clinic_change_events (transaction_id, table_name) INCLUDE (event_id);
CREATE INDEX IF NOT EXISTS clinic_change_events_retention_idx ON clinic_change_events (created_at);
ALTER TABLE clinic_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinic_change_events FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON clinic_change_events FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,DELETE ON clinic_change_events TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION notify_clinic_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  -- Qualification keeps hosted public profiles and isolated test schemas safe.
  EXECUTE format('INSERT INTO %I.clinic_change_events (table_name) VALUES ($1)', TG_TABLE_SCHEMA)
    USING TG_TABLE_NAME;
  PERFORM pg_notify('clinic_changes', TG_TABLE_NAME);
  RETURN NULL;
END;
$$;
