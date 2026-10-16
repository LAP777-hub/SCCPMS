import { expect, test, type Page } from '@playwright/test';
import { emptyOverview } from './admin-overview-fixture';

const adminId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000002';
function state() {
  return { overview: emptyOverview(), reads: 0, unavailable: false, writes: [] as string[],
    notifications: [] as Array<{ id: string; title: string; message: string; created_at: string; read_at: string | null }>,
    patients: [{ id: patientId, full_name: 'Fixture Patient', email: 'patient@example.invalid', user_type: 'Student', active: true, created_at: '2026-10-15T08:00:00Z' }],
    staff: [{ id: '00000000-0000-4000-8000-000000000003', role: 'doctor', full_name: 'Fixture Doctor', email: 'doctor@example.invalid', active: true, department: 'Clinic' }],
  };
}
async function open(page: Page, data: ReturnType<typeof state>) {
  let verified = false;
  const user = { id: adminId, email: 'admin@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { clinic_role: 'admin' }, user_metadata: {}, email_confirmed_at: '2026-10-15T08:00:00Z', created_at: '2026-10-15T08:00:00Z' };
  const payload = Buffer.from(JSON.stringify({ sub: adminId, session_id: '00000000-0000-4000-8000-000000000009', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.startsWith('/auth/v1/')) return route.fulfill({ json: path.endsWith('/user') ? user : { access_token: `e30.${payload}.fixture`, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user } });
    if (path === '/auth/profile') return route.fulfill({ json: { data: { ...user, role: 'admin', full_name: 'Fixture Administrator' } } });
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified } });
    if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { deliveryMode: 'email', destination: 'ad***@example.invalid', expiresInSeconds: 300 } });
    if (path === '/auth/otp/verify') { verified = true; return route.fulfill({ json: { message: 'Verified fixture' } }); }
    if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture polling only' } });
    if (path.startsWith('/api/')) {
      if (request.method() !== 'GET') data.writes.push(`${request.method()} ${path}`);
      if (path === '/api/admin/overview') { data.reads++; return route.fulfill(data.unavailable ? { status: 503, json: { error: 'Overview temporarily unavailable.' } } : { json: { data: data.overview } }); }
      const response = path === '/api/patients' ? data.patients : path === '/api/staff' ? data.staff : path === '/api/notifications' ? data.notifications : path === '/api/clinic/settings' ? { timezone: 'Africa/Johannesburg', opens_at: '08:00:00', closes_at: '17:00:00', default_appointment_minutes: 30, minimum_reschedule_notice_hours: 2 } : [];
      return route.fulfill({ json: { data: response } });
    }
    return url.origin === 'http://127.0.0.1:5178' ? route.continue() : route.abort();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Admin / }).click();
  await page.getByLabel('Email Address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByLabel('6-Digit Code').fill('123456'); await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Clinic Overview', exact: true })).toBeVisible();
  await expect(page.locator('.ao-stat')).toHaveCount(4);
}
const cardValue = (page: Page, label: string) => page.getByRole('article', { name: label, exact: true }).locator('.ao-stat-value');

test('empty admin database renders four zero totals and genuinely empty charts, lists and finances', async ({ page }) => {
  const data = state(); await open(page, data);
  for (const label of ['Total Patients', 'Doctors', 'Appointments', 'Medical Records']) await expect(cardValue(page, label)).toHaveText('0');
  await expect(page.getByRole('img', { name: /Appointments Overview, Monday to Sunday.*All values zero/ })).toBeVisible();
  const zeroLines = await page.locator('.ao-sparkline polyline').evaluateAll(lines => lines.every(line => new Set(line.getAttribute('points')?.split(' ').map(point => point.split(',')[1])).size === 1));
  expect(zeroLines).toBe(true);
  await expect(page.locator('.ao-donut circle')).toHaveCount(1);
  await expect(page.getByText('No active patient accounts yet.')).toBeVisible();
  await expect(page.getByText('No appointments recorded yet.')).toBeVisible();
  await expect(page.getByText('No appointments scheduled for today.')).toBeVisible();
  await expect(page.getByText('No notifications yet.')).toBeVisible();
  await expect(page.locator('.ao-finance strong')).toHaveText(['—', '—', '—']);
  await expect(page.getByText('No financial data recorded. Revenue and expense totals are unavailable.')).toBeVisible();
  expect(data.writes).toEqual([]);
});

test('overview charts and lists display only the supplied database counts and actual identities', async ({ page }) => {
  const data = state(); data.overview.totals = { patients: 4, doctors: 2, appointments: 7, medicalRecords: 3 };
  data.overview.demographics.forEach(item => item.count = 1);
  data.overview.weeklyAppointments[4].count = 7; data.overview.trends.appointments[4].value = 7;
  const appointment = { id: 'appointment-fixture', startsAt: '2026-10-16T08:00:00Z', endsAt: '2026-10-16T08:30:00Z', status: 'confirmed', consultationType: 'Fixture consultation', patientName: 'Fixture Patient', doctorName: 'Fixture Doctor' };
  data.overview.recentAppointments = [appointment]; data.overview.todayTimeline = [appointment];
  data.notifications = [{ id: 'notice-fixture', title: 'Appointment confirmed', message: 'Fixture appointment was confirmed.', created_at: '2026-10-16T07:00:00Z', read_at: null }];
  await open(page, data);
  for (const [label, value] of [['Total Patients', '4'], ['Doctors', '2'], ['Appointments', '7'], ['Medical Records', '3']]) await expect(cardValue(page, label)).toHaveText(value);
  await expect(page.locator('.ao-demographic-legend small')).toHaveText(['25%', '25%', '25%', '25%']);
  await expect(page.getByRole('button', { name: 'Fri, 2026-10-16: 7 appointments' })).toBeVisible();
  await page.getByRole('button', { name: 'Fri, 2026-10-16: 7 appointments' }).focus();
  await expect(page.locator('.ao-chart-summary')).toContainText('7 appointments');
  await expect(page.locator('.ao-recent-list')).toContainText('Fixture Patient'); await expect(page.locator('.ao-recent-list')).toContainText('confirmed');
  await expect(page.locator('.ao-timeline')).toContainText('Fixture Doctor'); await expect(page.locator('.ao-notice-list')).toContainText('Appointment confirmed');
  await expect(page.locator('.admin-unread-count')).toHaveText('1');
});

test('15-second polling updates totals and recovers an outage without clearing an open registration form', async ({ page }) => {
  await page.clock.install(); const data = state(); await open(page, data);
  const before = data.reads; data.overview = emptyOverview(3);
  await page.clock.fastForward(15_001);
  await expect(cardValue(page, 'Total Patients')).toHaveText('3'); expect(data.reads).toBeGreaterThan(before);
  data.unavailable = true; await page.clock.fastForward(15_001);
  await expect(page.getByRole('alert')).toContainText('Overview temporarily unavailable'); await expect(cardValue(page, 'Total Patients')).toHaveText('3');
  data.unavailable = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Patient', exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Retained unsaved patient');
  const formReads = data.reads; await page.clock.fastForward(15_001);
  await expect.poll(() => data.reads).toBeGreaterThan(formReads);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Retained unsaved patient');
  await expect(page.getByRole('heading', { name: 'Register and invite patient' })).toBeVisible(); expect(data.writes).toEqual([]);
});

test('quick booking and staff actions open the existing forms, and search opens a filtered real directory', async ({ page }) => {
  const data = state(); await open(page, data);
  await page.getByRole('button', { name: 'New Appointment', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Schedule an appointment' })).toBeVisible();
  await page.locator('aside nav').getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Add Doctor', exact: true }).click(); await expect(page.locator('.admin-modal')).toBeVisible();
  await page.locator('.admin-modal').getByRole('button', { name: 'Receptionist', exact: true }).click(); await expect(page.locator('.admin-modal select').first()).toHaveValue('Reception / Front desk');
  await page.locator('.admin-modal-close').click();
  await page.getByLabel('Search clinic').fill('Fixture Patient'); await page.locator('#admin-search-results').getByRole('button', { name: 'Fixture Patient Patient', exact: true }).click();
  await expect(page.getByLabel('Search patients')).toHaveValue('patient@example.invalid'); await expect(page.getByRole('row').filter({ hasText: 'Fixture Patient' })).toBeVisible();
  expect(data.writes).toEqual([]);
});

for (const width of [390, 768, 1536]) test(`admin reference layout remains usable without page overflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1536 ? 1024 : 844 }); const data = state(); await open(page, data);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (width === 1536) {
    await expect(page.locator('.ao-stat-grid')).toHaveCSS('grid-template-columns', /\S+ \S+ \S+ \S+/);
    const middle = await page.locator('.ao-middle-grid > article').evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(middle).size).toBe(1);
    const bottom = await page.locator('.ao-bottom-grid > article').evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)));
    expect(new Set(bottom).size).toBe(1);
    await page.screenshot({ path: 'test-results/admin-overview-desktop.png', fullPage: true });
  } else { await page.getByRole('button', { name: 'Toggle menu' }).click(); await expect(page.locator('aside').getByRole('button', { name: 'Sign Out' })).toBeVisible(); await page.getByRole('button', { name: 'Close menu' }).click(); }
  await expect(page.getByRole('button', { name: 'System Settings', exact: true })).toBeAttached();
});
