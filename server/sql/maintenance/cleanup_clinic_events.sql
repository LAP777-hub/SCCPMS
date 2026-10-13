-- Explicit daily maintenance, run using the database administrator connection.
-- This file is outside the automatic numbered migration runner.
-- Retain seven days of invalidation metadata; clinical and audit records remain.
DELETE FROM clinic_change_events WHERE created_at < now() - interval '7 days';
