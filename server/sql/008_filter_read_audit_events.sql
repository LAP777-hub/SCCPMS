-- Reading clinical records is audited, but must not trigger another record read.
DROP TRIGGER IF EXISTS clinic_change ON audit_events;
CREATE TRIGGER clinic_change AFTER INSERT ON audit_events
FOR EACH ROW WHEN (NEW.action NOT LIKE 'clinical.%.read')
EXECUTE FUNCTION notify_clinic_change();
