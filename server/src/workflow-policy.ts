export type LabStatus = 'ordered' | 'collected' | 'processing' | 'resulted' | 'cancelled';

export function previousLabStatuses(next: LabStatus): LabStatus[] {
  if (next === 'collected') return ['ordered'];
  if (next === 'processing') return ['collected'];
  if (next === 'resulted') return ['ordered', 'collected', 'processing'];
  if (next === 'cancelled') return ['ordered', 'collected', 'processing'];
  return [];
}

export function validClinicTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function schedulingConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['23P01', '40P01', '40001'].includes(String(error.code))
  );
}

// Apply the same clinic/leave policy to discovery, booking and rescheduling.
export const bookableSlotConditions = `s.status = 'available' AND d.active = true
  AND s.starts_at > now()
  AND (s.starts_at AT TIME ZONE c.timezone)::time >= c.opens_at
  AND (s.ends_at AT TIME ZONE c.timezone)::time <= c.closes_at
  AND (s.starts_at AT TIME ZONE c.timezone)::date = (s.ends_at AT TIME ZONE c.timezone)::date
  AND NOT EXISTS (SELECT 1 FROM clinic_holidays h
    WHERE h.holiday_date = (s.starts_at AT TIME ZONE c.timezone)::date)
  AND NOT EXISTS (SELECT 1 FROM doctor_leave_requests l
    WHERE l.doctor_user_id = d.user_id AND l.status = 'approved'
      AND (s.starts_at AT TIME ZONE c.timezone)::date BETWEEN l.starts_on AND l.ends_on)
  AND NOT EXISTS (SELECT 1 FROM appointments a
    WHERE a.doctor_id = s.doctor_id AND a.status NOT IN ('cancelled', 'no_show')
      AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)'))`;
