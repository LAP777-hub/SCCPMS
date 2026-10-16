import { expect, test, type Page } from '@playwright/test';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function login(page: Page, role: string) {
  const id = '00000000-0000-4000-8000-000000000301';
  const user = { id, email: `${role}.fixture@gmail.com`, app_metadata: { clinic_role: role }, user_metadata: {}, role: 'authenticated', aud: 'authenticated', email_confirmed_at: '2026-10-16T00:00:00Z' };
  const claims = Buffer.from(JSON.stringify({ sub: id, session_id: '00000000-0000-4000-8000-000000000302', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
  const state = { uploaded: false, uploads: 0, verified: false };
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.startsWith('/auth/v1/')) return route.fulfill({ json: path.endsWith('/user') ? user : { access_token: `e30.${claims}.fixture`, refresh_token: 'photo-fixture-refresh', expires_in: 3600, token_type: 'bearer', user } });
    if (path === '/auth/profile') return route.fulfill({ json: { data: { ...user, role, full_name: 'Photo Fixture', avatar_path: state.uploaded ? `${id}/fixture.webp` : null } } });
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified: state.verified } });
    if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { message: 'Fixture code', deliveryMode: 'email' } });
    if (path === '/auth/otp/verify') { state.verified = true; return route.fulfill({ json: { message: 'Verified fixture' } }); }
    if (path === '/api/profile/photo') {
      if (request.method() === 'PUT') {
        expect(request.headers()['content-type']).toBe('image/png'); expect(request.postDataBuffer()).toEqual(png);
        state.uploaded = true; state.uploads++;
      }
      return route.fulfill({ json: { data: { url: `data:image/png;base64,${png.toString('base64')}` } } });
    }
    if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture polling only' } });
    if (path.startsWith('/api/')) return route.fulfill({ json: { data: path === '/api/clinic/settings' ? { timezone: 'Africa/Johannesburg' } : path === '/api/analytics' ? { patients: 0, doctors: 0, staff: 0, appointmentsToday: 0, pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0, pendingLeaveRequests: 0, dailyAppointments: [] } : [] } });
    return url.origin === 'http://127.0.0.1:5178' ? route.continue() : route.abort();
  });
  await page.goto('/'); await page.getByRole('button', { name: new RegExp(`^${role}`, 'i') }).click();
  await page.getByLabel('Email Address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await page.getByLabel('6-Digit Code').fill('123456'); await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  return state;
}
for (const role of ['admin','doctor','patient','receptionist']) test(`${role} can upload a profile photo and see its persisted image after reload`, async ({ page }) => {
  if (role === 'receptionist') await page.setViewportSize({ width: 390, height: 844 });
  const state = await login(page, role);
  await page.getByRole('button', { name: 'Edit profile photo' }).first().click();
  const modal = page.getByRole('dialog', { name: 'Profile photo' }); await expect(modal).toBeVisible();
  await page.getByLabel('Choose profile photo').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Profile photo saved'); expect(state.uploads).toBe(1);
  await page.getByRole('button', { name: 'Close dialog' }).click(); await page.reload();
  await expect(page.getByRole('img', { name: 'Your profile', exact: true }).first()).toBeVisible();
  expect(state.uploads).toBe(1);
});
