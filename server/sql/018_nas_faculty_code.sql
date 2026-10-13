-- Correct the student/staff patient faculty code without altering clinical staff departments.
UPDATE profiles
SET department = 'NAS'
WHERE department = 'NURS'
  AND role IN ('patient', 'student', 'lecturer', 'staff');
