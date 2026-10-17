import { expect, test, type Locator, type Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000501';
const sessionId = '00000000-0000-4000-8000-000000000502';

async function mockModalWorkspace(page: Page, invitation = false) {
  const role = invitation ? 'doctor' : 'admin';
  const user = { id: userId, email: `${role}.modal@clinic-fixture.co.za`, app_metadata: { clinic_role: role }, user_metadata: {}, role: 'authenticated', aud: 'authenticated', email_confirmed_at: '2026-10-16T00:00:00Z' };
  const token = `e30.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
  let verified = false;
  const writes: string[] = [];
  const accounts = Array.from({ length: 28 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(600 + index).padStart(12, '0')}`, role: 'doctor', full_name: `Modal Doctor Fixture ${index + 1}`,
    email: `doctor${index + 1}.modal@clinic-fixture.co.za`, phone: '+27712345678', department: 'General Medicine', specialty: 'Family Medicine',
    program: 'Family Medicine', student_number: null, staff_number: null, active: true, doctor_active: false,
    deleted_at: '2026-10-16T00:00:00Z', reinvited_user_id: null, reinvited_at: null,
  }));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.startsWith('/auth/v1/')) return route.fulfill({ json: path.endsWith('/user') ? user : { access_token: token, refresh_token: 'modal-fixture-refresh', expires_in: 3600, token_type: 'bearer', user } });
    if (path === '/auth/profile') return route.fulfill({ json: { data: { ...user, role, full_name: 'Modal Administrator Fixture', avatar_path: null } } });
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified } });
    if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { message: 'Fixture accepted code', deliveryMode: 'email', expiresInSeconds: 300 } });
    if (path === '/auth/otp/verify') { verified = true; return route.fulfill({ json: { message: 'Verified fixture' } }); }
    if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture uses polling' } });
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      if (request.method() !== 'GET') { writes.push(`${request.method()} ${path}`); return route.fulfill({ status: 503, json: { error: 'This modal positioning test must not submit data.' } }); }
      const data = path === '/api/account-records' ? accounts
        : path === '/api/staff' ? accounts.map(account => ({ ...account, deleted_at: null }))
          : path === '/api/clinic/settings' ? { timezone: 'Africa/Johannesburg' }
            : path === '/api/admin/overview' ? { timezone: 'Africa/Johannesburg', generatedAt: '2026-10-16T08:00:00Z', totals: { patients: 0, doctors: 0, appointments: 0, medicalRecords: 0 }, trends: { patients: [], doctors: [], appointments: [], medicalRecords: [] }, weeklyAppointments: [], demographics: [], recentAppointments: [], todayTimeline: [], finances: { available: false, currency: 'ZAR', income: 0, expenses: 0, net: 0, series: [] } }
              : path === '/api/analytics' ? { patients: 0, doctors: 0, staff: 0, appointmentsToday: 0, pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0, pendingLeaveRequests: 0, dailyAppointments: [] } : [];
      return route.fulfill({ json: { data } });
    }
    return url.origin === 'http://127.0.0.1:5178' ? route.continue() : route.abort();
  });
  if (invitation) {
    const fragment = new URLSearchParams({ access_token: token, refresh_token: 'modal-invitation-refresh', token_type: 'bearer', expires_in: '3600', type: 'invite' });
    await page.goto(`/?auth_action=invite#${fragment}`);
  } else {
    await page.goto('/'); await page.getByRole('button', { name: /^Admin / }).click();
    await page.getByLabel('Email Address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await page.getByLabel('6-Digit Code').fill('123456'); await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.locator('.admin-shell')).toBeVisible();
  }
  return { writes };
}

async function expectCentered(dialog: Locator) {
  await expect(dialog).toBeVisible();
  const g = await dialog.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
  expect(Math.abs(g.x + g.width / 2 - g.vw / 2)).toBeLessThanOrEqual(2); expect(Math.abs(g.y + g.height / 2 - g.vh / 2)).toBeLessThanOrEqual(2);
  expect(g.x).toBeGreaterThanOrEqual(0); expect(g.y).toBeGreaterThanOrEqual(0); expect(g.x + g.width).toBeLessThanOrEqual(g.vw + 1); expect(g.y + g.height).toBeLessThanOrEqual(g.vh + 1); expect(g.overflow).toBe(false);
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Toggle menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('aside nav').getByRole('button', { name, exact: true }).click();
}
async function expectBackgroundScrolled(page: Page) {
  expect(await page.evaluate(() => Math.max(window.scrollY, ...Array.from(document.querySelectorAll('*')).map(element => element.scrollTop)))).toBeGreaterThan(100);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`retained account dialog remains centered above a scrolled Records page at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); const state = await mockModalWorkspace(page); await navigate(page, 'Records');
    const open = page.getByRole('button', { name: 'View record', exact: true }).last(); await open.scrollIntoViewIfNeeded(); await expectBackgroundScrolled(page); await open.click();
    const dialog = page.getByRole('dialog', { name: 'Modal Doctor Fixture 28', exact: true }); await expectCentered(dialog);
    await expect(dialog.getByRole('link', { name: 'doctor28.modal@clinic-fixture.co.za', exact: true })).toHaveAttribute('href', 'mailto:doctor28.modal@clinic-fixture.co.za');
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click(); await expect(dialog).toHaveCount(0); expect(state.writes).toEqual([]);
  });
  test(`staff invitation stays centered above an already scrolled staff directory at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); const state = await mockModalWorkspace(page); await navigate(page, 'Doctors & Staff');
    await page.getByRole('row').filter({ hasText: 'Modal Doctor Fixture 28' }).scrollIntoViewIfNeeded(); await expectBackgroundScrolled(page);
    // Preserve the scrolled background: Playwright's pointer click would first
    // scroll this offscreen invitation button back into view.
    await page.getByRole('button', { name: 'Invite doctor', exact: true }).evaluate(element => (element as HTMLButtonElement).click());
    const dialog = page.locator('.admin-modal'); await expect(dialog.getByRole('heading', { name: 'Register Doctor', exact: true })).toBeVisible(); await expectCentered(dialog);
    await dialog.getByLabel('Full Name *', { exact: true }).fill('Unsubmitted modal draft'); await expectCentered(dialog);
    await dialog.getByRole('button', { name: 'Close registration', exact: true }).click(); await expect(dialog).toHaveCount(0); expect(state.writes).toEqual([]);
  });
  test(`invited staff password setup is centered with keyboard focus at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); const state = await mockModalWorkspace(page, true);
    const dialog = page.getByRole('dialog', { name: 'Set your password', exact: true }); await expectCentered(dialog);
    await expect(dialog.getByLabel('New Password', { exact: true })).toBeFocused(); await expect(dialog.getByLabel('Confirm Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify Your Identity', exact: true })).toHaveCount(0); expect(state.writes).toEqual([]);
  });
}
