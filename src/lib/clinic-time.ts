export function clinicDate(value: string | Date = new Date(), timezone = 'Africa/Johannesburg') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((item) => item.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatClinicDate(value: string, timezone = 'Africa/Johannesburg') {
  return new Date(value).toLocaleString(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
}

// Convert the clinic's wall-clock time independently of the device's timezone.
export function clinicTimeToIso(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (key: string) => Number(parts.find((part) => part.type === key)?.value);
    const rendered = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const correction = target - rendered;
    if (correction === 0) return new Date(instant).toISOString();
    instant += correction;
  }
  throw new Error('That local time does not exist in the selected clinic timezone. Choose a different time.');
}
