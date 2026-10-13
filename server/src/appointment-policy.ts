import type { AppRole } from './auth.js';

export type AppointmentStatus =
  'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export function allowedPreviousAppointmentStatuses(
  role: AppRole,
  nextStatus: AppointmentStatus
): AppointmentStatus[] {
  if (['patient', 'student', 'lecturer', 'staff'].includes(role)) {
    return nextStatus === 'cancelled' ? ['pending', 'confirmed'] : [];
  }
  if (role === 'doctor') {
    if (nextStatus === 'confirmed') return ['pending'];
    if (nextStatus === 'cancelled') return ['pending', 'confirmed'];
    if (nextStatus === 'in_progress' || nextStatus === 'no_show') return ['confirmed'];
    if (nextStatus === 'completed') return ['in_progress'];
    return [];
  }
  if (role === 'receptionist' || role === 'admin') {
    if (nextStatus === 'confirmed') return ['pending'];
    if (nextStatus === 'cancelled') return ['pending', 'confirmed'];
  }
  return [];
}

export function canChangeAppointmentStatus(
  role: AppRole,
  currentStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
  isOwnerOrAssignee: boolean
) {
  return (
    isOwnerOrAssignee &&
    allowedPreviousAppointmentStatuses(role, nextStatus).includes(currentStatus)
  );
}

export function isWithinClinicHours(input: {
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  opensAt: string;
  closesAt: string;
  isHoliday: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.startsAt <= now || input.endsAt <= input.startsAt || input.isHoliday) return false;

  try {
    const dateParts = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: input.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    const timeParts = (date: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: input.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date);
    const startTime = timeParts(input.startsAt);
    const endTime = timeParts(input.endsAt);
    return (
      dateParts(input.startsAt) === dateParts(input.endsAt) &&
      startTime >= input.opensAt &&
      endTime <= input.closesAt
    );
  } catch {
    return false;
  }
}
