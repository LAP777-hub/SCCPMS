DROP TRIGGER IF EXISTS clinic_change ON public.profiles;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH STATEMENT EXECUTE FUNCTION notify_clinic_change();
