import { expect, test, type Locator, type Page } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const photoUrl = `data:image/png;base64,${png.toString('base64')}`;
const fiveMegabytes = 5 * 1024 * 1024;
const roles = ['admin', 'doctor', 'patient', 'receptionist'] as const;

async function login(page: Page, role: typeof roles[number], initiallyUploaded = false) {
  const id = '00000000-0000-4000-8000-000000000301';
  const user = { id, email: `${role}.fixture@gmail.com`, app_metadata: { clinic_role: role }, user_metadata: {}, role: 'authenticated', aud: 'authenticated', email_confirmed_at: '2026-10-16T00:00:00Z' };
  const claims = Buffer.from(JSON.stringify({ sub: id, session_id: '00000000-0000-4000-8000-000000000302', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const state = { uploaded: initiallyUploaded, uploads: 0, removals: 0, verified: false, uploadedBodies: [] as Buffer[], writes: [] as string[] };
  const records = Array.from({ length: 28 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(400 + index).padStart(12, '0')}`,
    full_name: `Retained Photo Fixture ${index + 1}`, role: 'patient', email: `retained${index + 1}@clinic-fixture.co.za`, phone: '+27712345678',
    department: 'NAS', program: 'BSc in Data Science', student_number: `FIXTURE${index + 1}`, staff_number: null,
    deleted_at: '2026-10-16T00:00:00Z', reinvited_user_id: null, reinvited_at: null,
  }));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.startsWith('/auth/v1/')) return route.fulfill({ json: path.endsWith('/user') ? user : { access_token: `e30.${claims}.fixture`, refresh_token: 'photo-fixture-refresh', expires_in: 3600, token_type: 'bearer', user } });
    if (path === '/auth/profile') return route.fulfill({ json: { data: { ...user, role, full_name: 'Photo Fixture', avatar_path: state.uploaded ? `${id}/fixture.webp` : null } } });
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified: state.verified } });
    if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { message: 'Fixture code accepted', deliveryMode: 'email', expiresInSeconds: 300 } });
    if (path === '/auth/otp/verify') { state.verified = true; return route.fulfill({ json: { message: 'Verified fixture' } }); }
    if (path === '/api/profile/photo') {
      expect(request.headers().authorization).toMatch(/^Bearer /);
      if (request.method() === 'PUT') {
        expect(request.headers()['content-type']).toBe('image/webp');
        const body = request.postDataBuffer(); expect(body).not.toBeNull();
        expect(body!.subarray(0, 4).toString()).toBe('RIFF'); expect(body!.subarray(8, 12).toString()).toBe('WEBP');
        expect(body!.length).toBeGreaterThan(12); expect(body!.length).toBeLessThan(4 * 1024 * 1024);
        state.uploadedBodies.push(body!); state.uploaded = true; state.uploads++; state.writes.push('PUT /api/profile/photo');
      } else if (request.method() === 'DELETE') { state.uploaded = false; state.removals++; state.writes.push('DELETE /api/profile/photo'); }
      return route.fulfill({ json: { data: { url: state.uploaded ? photoUrl : null }, message: request.method() === 'DELETE' ? 'Profile photo removed.' : 'Profile photo saved.' } });
    }
    if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture polling only' } });
    if (path.startsWith('/api/')) {
      if (request.method() !== 'GET') throw new Error(`Unexpected mutation in isolated photo fixture: ${path}`);
      const data = path === '/api/clinic/settings' ? { timezone: 'Africa/Johannesburg' }
        : path === '/api/admin/overview' ? { timezone: 'Africa/Johannesburg', generatedAt: '2026-10-16T08:00:00Z', totals: { patients: 0, doctors: 0, appointments: 0, medicalRecords: 0 }, trends: { patients: [], doctors: [], appointments: [], medicalRecords: [] }, weeklyAppointments: [], demographics: [], recentAppointments: [], todayTimeline: [], finances: { available: false, currency: 'ZAR', income: 0, expenses: 0, net: 0, series: [] } }
          : path === '/api/account-records' ? records
            : path === '/api/analytics' ? { patients: 0, doctors: 0, staff: 0, appointmentsToday: 0, pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0, pendingLeaveRequests: 0, dailyAppointments: [] } : [];
      return route.fulfill({ json: { data } });
    }
    return url.origin === 'http://127.0.0.1:5178' ? route.continue() : route.abort();
  });
  await page.goto('/'); await page.getByRole('button', { name: new RegExp(`^${role}`, 'i') }).click();
  await page.getByLabel('Email Address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await page.getByLabel('6-Digit Code').fill('123456'); await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('button', { name: 'Edit profile photo' }).first()).toBeVisible();
  return state;
}

async function openPhotoEditor(page: Page) {
  await page.getByRole('button', { name: 'Edit profile photo' }).first().click();
  const modal = page.getByRole('dialog', { name: 'Profile photo', exact: true }); await expect(modal).toBeVisible();
  for (const action of ['Select image', 'Upload image', 'Remove image', 'View larger']) await expect(modal.getByRole('button', { name: action, exact: true })).toBeVisible();
  return modal;
}
async function expectCentered(dialog: Locator) {
  const g = await dialog.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
  expect(Math.abs(g.x + g.width / 2 - g.vw / 2)).toBeLessThanOrEqual(2); expect(Math.abs(g.y + g.height / 2 - g.vh / 2)).toBeLessThanOrEqual(2);
  expect(g.x).toBeGreaterThanOrEqual(0); expect(g.y).toBeGreaterThanOrEqual(0); expect(g.x + g.width).toBeLessThanOrEqual(g.vw + 1); expect(g.y + g.height).toBeLessThanOrEqual(g.vh + 1); expect(g.overflow).toBe(false);
}

for (const role of roles) test(`${role} uploads and removes a profile image with both changes retained after reload`, async ({ page }) => {
  if (role === 'receptionist') await page.setViewportSize({ width: 390, height: 844 });
  const state = await login(page, role); const modal = await openPhotoEditor(page);
  for (const action of ['Upload image', 'Remove image', 'View larger']) await expect(modal.getByRole('button', { name: action, exact: true })).toBeDisabled();
  const chooser = page.waitForEvent('filechooser'); await modal.getByRole('button', { name: 'Select image', exact: true }).click();
  await (await chooser).setFiles({ name: 'chosen-profile.png', mimeType: 'image/png', buffer: png });
  await expect(modal).toContainText('chosen-profile.png'); expect(state.uploads).toBe(0);
  await expect(modal.getByRole('img', { name: 'Selected profile image', exact: true })).toHaveAttribute('src', /^blob:/);
  await modal.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Profile photo saved'); expect(state.uploadedBodies).toHaveLength(1);
  await modal.getByRole('button', { name: 'Close dialog', exact: true }).click(); await page.reload();
  await expect(page.getByRole('img', { name: 'Your profile', exact: true }).first()).toBeVisible(); expect(state.uploads).toBe(1);
  const restored = await openPhotoEditor(page); await restored.getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(restored.getByRole('status')).toContainText('Profile photo removed'); expect(state.removals).toBe(1);
  await restored.getByRole('button', { name: 'Close dialog', exact: true }).click(); await page.reload();
  await expect(page.getByRole('button', { name: 'Edit profile photo' }).first()).toBeVisible(); await expect(page.getByRole('img', { name: 'Your profile', exact: true })).toHaveCount(0);
  expect(state.writes).toEqual(['PUT /api/profile/photo', 'DELETE /api/profile/photo']);
});

test('five-megabyte source limit preserves valid selection and uploads the current filename as a bounded WebP', async ({ page }) => {
  const state = await login(page, 'admin'); const modal = await openPhotoEditor(page); const input = modal.getByLabel('Choose profile photo');
  const oversized = { name: 'oversized.png', mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.alloc(fiveMegabytes + 1 - png.length)]) };
  await input.setInputFiles(oversized); await expect(modal.getByRole('alert')).toContainText('5 MB'); await expect(modal.getByRole('button', { name: 'Upload image', exact: true })).toBeDisabled(); expect(state.uploads).toBe(0);
  await input.setInputFiles({ name: 'first-selection.png', mimeType: 'image/png', buffer: png }); await expect(modal).toContainText('first-selection.png');
  await input.setInputFiles(oversized); await expect(modal.getByRole('alert')).toContainText('5 MB'); await expect(modal).toContainText('first-selection.png'); await expect(modal.getByRole('button', { name: 'Upload image', exact: true })).toBeEnabled();
  await input.setInputFiles({ name: 'exactly-five-megabytes.png', mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.alloc(fiveMegabytes - png.length)]) });
  await expect(modal).toContainText('exactly-five-megabytes.png'); await expect(modal).not.toContainText('first-selection.png'); await expect(modal.getByRole('alert')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Upload image', exact: true }).click(); await expect(modal.getByRole('status')).toContainText('Profile photo saved'); expect(state.uploadedBodies).toHaveLength(1);
});

test('image preparation failure does not send the original file or leave the editor busy', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.toBlob = callback => callback(null); });
  const state = await login(page, 'admin'); const modal = await openPhotoEditor(page);
  await modal.getByLabel('Choose profile photo').setInputFiles({ name: 'encode-failure.png', mimeType: 'image/png', buffer: png });
  await modal.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Unable to prepare this image');
  await expect(modal.getByRole('button', { name: 'Upload image', exact: true })).toBeEnabled();
  await expect(modal).toContainText('encode-failure.png'); expect(state.writes).toEqual([]);
});

test('removing an unsaved selection restores the saved image without deleting it', async ({ page }) => {
  const state = await login(page, 'admin', true); await expect(page.getByRole('img', { name: 'Your profile', exact: true }).first()).toBeVisible();
  const modal = await openPhotoEditor(page); await modal.getByLabel('Choose profile photo').setInputFiles({ name: 'not-uploaded.png', mimeType: 'image/png', buffer: png }); await expect(modal).toContainText('not-uploaded.png');
  await expect(modal.getByRole('img', { name: 'Selected profile image', exact: true })).toHaveAttribute('src', /^blob:/);
  await modal.getByRole('button', { name: 'Remove image', exact: true }).click(); await expect(modal.getByRole('img', { name: 'Your current profile', exact: true })).toHaveAttribute('src', photoUrl);
  await expect(modal).not.toContainText('not-uploaded.png'); await expect(modal.getByRole('button', { name: 'Upload image', exact: true })).toBeDisabled(); expect(state.uploads).toBe(0); expect(state.removals).toBe(0); expect(state.uploaded).toBe(true);
  await modal.getByRole('button', { name: 'Close dialog', exact: true }).click(); await page.reload(); await expect(page.getByRole('img', { name: 'Your profile', exact: true }).first()).toBeVisible(); expect(state.writes).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) test(`photo editor and larger view remain centered after scrolling at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport); const state = await login(page, 'admin', true);
  if (viewport.width < 960) await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
  await page.locator('aside nav').getByRole('button', { name: 'Records', exact: true }).click(); await page.getByRole('button', { name: 'View record', exact: true }).last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => Math.max(window.scrollY, ...Array.from(document.querySelectorAll('*')).map(element => element.scrollTop)))).toBeGreaterThan(100);
  const modal = await openPhotoEditor(page); await expectCentered(modal); await modal.getByRole('button', { name: 'View larger', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'View smaller', exact: true })).toBeVisible(); await expectCentered(modal);
  const image = modal.getByRole('img', { name: 'Your current profile', exact: true }); await expect(image).toHaveAttribute('src', photoUrl); await expect(image).toHaveClass(/profile-photo-preview-large/);
  expect(await image.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(140);
  await modal.getByRole('button', { name: 'Close dialog', exact: true }).click(); const reopened = await openPhotoEditor(page); await expect(reopened.getByRole('button', { name: 'View larger', exact: true })).toBeVisible(); expect(state.writes).toEqual([]);
});
