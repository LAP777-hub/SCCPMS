export type ClinicSettings = {
  timezone: string;
  opens_at: string;
  closes_at: string;
  default_appointment_minutes: number;
  minimum_reschedule_notice_hours: number;
};

export const campusTimezone = 'Africa/Johannesburg';

export function clinicDate(value: string | Date = new Date(), timezone = campusTimezone) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function clinicTime(value: string | Date, timezone = campusTimezone) {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function clinicDateTime(value: string | Date, timezone = campusTimezone) {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function calendarDate(value: string) {
  return value.slice(0, 10);
}

// Interpret the form's wall time in the clinic's configured IANA timezone.
// Browsers elsewhere must submit the same instant as a browser at the clinic.
export function clinicInstant(date: string, time: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(`${date}T${time}`);
  if (!match) throw new Error('Choose a valid date and start time.');
  const values = match.slice(1).map(Number);
  const wall = Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4]);
  let instant = wall;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (name: string) => Number(parts.find(item => item.type === name)?.value);
    const represented = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    const adjustment = wall - represented;
    instant += adjustment;
    if (adjustment === 0) break;
  }
  const result = new Date(instant);
  if (clinicDate(result, timezone) !== date || clinicTime(result, timezone) !== time) {
    throw new Error('This local time does not exist in the clinic timezone. Choose another time.');
  }
  return result;
}

export function requestMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
