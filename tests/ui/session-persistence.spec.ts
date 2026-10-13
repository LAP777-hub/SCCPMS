import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const email = 'admin@example.invalid';
const settings = { timezone: 'Africa/Johannesburg', opens_at: '08:00:00', closes_at: '17:00:00', default_appointment_minutes: 30, minimum_reschedule_notice_hours: 2 };

async function mockClinic(page: Page) {
  const state = {
    verified: false,
    tokenRevision: 0,
    refreshCount: 0,
    authExpiresIn: 3600,
    refreshUnavailable: false,
    authLogoutCount: 0,
    apiLogoutCount: 0,
    patients: 0,
    rejectedToken: null as string | null,
    rejectedPaths: new Set<string>(),
    otpRequiredPaths: new Set<string>(),
    delayedOtpPath: null as string | null,
    unavailablePaths: new Set<string>(),
    rejectedRequests: [] as Array<{ path: string; token: string | undefined }>,
    otpRequiredRequests: [] as Array<{ path: string; token: string | undefined }>,
    successfulRequests: [] as Array<{ path: string; token: string | undefined }>,
    refreshGate: undefined as Promise<void> | undefined,
    rejectionGate: undefined as Promise<void> | undefined,
    otpGate: undefined as Promise<void> | undefined,
  };
  const user = {
    id: userId, email, aud: 'authenticated', role: 'authenticated',
    app_metadata: { clinic_role: 'admin' }, user_metadata: {},
    email_confirmed_at: '2026-10-12T00:00:00Z', created_at: '2026-10-12T00:00:00Z',
  };
  const profile = { id: userId, role: 'admin', email, full_name: 'Session Test Administrator', phone: null, user_type: null };
  let activeSessionId = sessionId;
  function token() {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: user.id, session_id: activeSessionId, role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + state.authExpiresIn, revision: state.tokenRevision,
    })).toString('base64url');
    return `${header}.${payload}.test-signature`;
  }
  let accessToken = token();
  function authResponse() {
    return { access_token: accessToken, refresh_token: `test-refresh-${state.tokenRevision}`, token_type: 'bearer', expires_in: state.authExpiresIn, user };
  }

  // Every auth/API request is fulfilled locally. Other external resources are
  // blocked; only preview documents and assets may reach the local web server.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/logout')) {
        state.authLogoutCount += 1;
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith('/token') && url.searchParams.get('grant_type') === 'password') accessToken = token();
      if (path.endsWith('/token') && url.searchParams.get('grant_type') === 'refresh_token') {
        state.refreshCount += 1;
        if (state.refreshUnavailable) return route.fulfill({ status: 503, json: { message: 'Temporary authentication outage' } });
        await state.refreshGate;
        state.tokenRevision += 1;
        accessToken = token();
      }
      return route.fulfill({ json: path.endsWith('/user') ? user : authResponse() });
    }
    if (path.startsWith('/auth/') || path.startsWith('/api/')) {
      if (path === '/auth/profile') return route.fulfill({ json: { data: profile } });
      if (path === '/auth/logout') {
        state.apiLogoutCount += 1;
        state.verified = false;
        return route.fulfill({ json: { message: 'Verification session ended.' } });
      }
      if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { message: 'Fixture email accepted.', deliveryMode: 'email', destination: 'ad***@example.invalid', expiresInSeconds: 300 } });
      if (path === '/auth/otp/status') return route.fulfill({ json: { verified: state.verified } });
      if (path === '/auth/otp/verify') {
        state.verified = true;
        return route.fulfill({ json: { message: 'Verified' } });
      }
      if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture uses polling fallback.' } });
      const authorization = route.request().headers().authorization;
      if (state.rejectedToken && authorization === `Bearer ${state.rejectedToken}` && state.rejectedPaths.has(path)) {
        state.rejectedRequests.push({ path, token: authorization });
        await state.rejectionGate;
        return route.fulfill({ status: 401, json: { code: 'SESSION_INVALID', error: 'The access token has expired.' } });
      }
      if (state.otpRequiredPaths.has(path)) {
        state.otpRequiredRequests.push({ path, token: authorization });
        if (path === state.delayedOtpPath) await state.otpGate;
        return route.fulfill({ status: 428, json: { code: 'OTP_REQUIRED', error: 'Email verification is required.' } });
      }
      if (state.unavailablePaths.has(path)) return route.fulfill({ status: 503, json: { error: 'Clinic service temporarily unavailable.' } });
      state.successfulRequests.push({ path, token: authorization });
      if (path === '/api/clinic/settings') return route.fulfill({ json: { data: settings } });
      if (path === '/api/analytics') return route.fulfill({ json: { data: {
        patients: state.patients, doctors: 0, staff: 0, appointmentsToday: 0,
        pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0,
        pendingLeaveRequests: 0, dailyAppointments: [],
      } } });
      return route.fulfill({ json: { data: [] } });
    }
    if (url.origin === 'http://127.0.0.1:5178') return route.continue();
    return route.abort();
  });
  return {
    state,
    expireAccessToken(paths: string[]) {
      state.rejectedToken = accessToken;
      state.rejectedPaths = new Set(paths);
    },
    currentAccessToken: () => accessToken,
    holdRefresh() {
      let release!: () => void;
      state.refreshGate = new Promise<void>(resolve => { release = resolve; });
      return () => { state.refreshGate = undefined; release(); };
    },
    holdRejection() {
      let release!: () => void;
      state.rejectionGate = new Promise<void>(resolve => { release = resolve; });
      return () => { state.rejectionGate = undefined; release(); };
    },
    holdOtpResponse(path: string) {
      let release!: () => void;
      state.delayedOtpPath = path;
      state.otpGate = new Promise<void>(resolve => { release = resolve; });
      return () => { state.delayedOtpPath = null; state.otpGate = undefined; release(); };
    },
    switchAccount() {
      user.id = '00000000-0000-4000-8000-000000000003';
      user.email = 'second-admin@example.invalid';
      profile.id = user.id;
      profile.email = user.email;
      profile.full_name = 'Second Session Test Administrator';
      activeSessionId = '00000000-0000-4000-8000-000000000004';
      state.tokenRevision += 1;
      accessToken = token();
    },
  };
}

async function openDashboard(page: Page, navigate = true, loginEmail = email) {
  if (navigate) await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Admin / }).click();
  await page.getByLabel('Email Address').fill(loginEmail);
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await page.getByLabel('6-Digit Code').fill('123456');
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Clinic Overview' })).toBeVisible();
  await expect(patientCount(page)).toHaveText('0');
}
const patientCount = (page: Page) => page.locator('.admin-stat-card').filter({ hasText: 'Active patients' }).locator('strong');
async function expectStillSignedIn(page: Page, state: Awaited<ReturnType<typeof mockClinic>>['state']) {
  await expect(page.locator('.admin-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0);
  expect(state.authLogoutCount).toBe(0);
  expect(state.apiLogoutCount).toBe(0);
}

test('an expired access token refreshes and retries its API request without logging out', async ({ page }) => {
  const clinic = await mockClinic(page);
  await openDashboard(page);
  const expiredToken = clinic.currentAccessToken();
  clinic.expireAccessToken(['/api/analytics']);
  clinic.state.patients = 3;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(patientCount(page)).toHaveText('3');
  expect(clinic.state.refreshCount).toBe(1);
  expect(clinic.state.rejectedRequests).toEqual([{ path: '/api/analytics', token: `Bearer ${expiredToken}` }]);
  expect(clinic.state.successfulRequests.some(request => request.path === '/api/analytics' && request.token === `Bearer ${clinic.currentAccessToken()}`)).toBe(true);
  const claims = JSON.parse(Buffer.from(clinic.currentAccessToken().split('.')[1], 'base64url').toString());
  expect(claims).toMatchObject({ sub: userId, session_id: sessionId });
  await expectStillSignedIn(page, clinic.state);
});

test('concurrent expired-token responses share one refresh and preserve the same authenticated session', async ({ page }) => {
  const clinic = await mockClinic(page);
  await openDashboard(page);
  const paths = ['/api/doctors', '/api/staff', '/api/patients'];
  clinic.expireAccessToken(paths);
  clinic.state.patients = 4;
  const release = clinic.holdRefresh();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => clinic.state.rejectedRequests.length).toBe(paths.length);
  await expect.poll(() => clinic.state.refreshCount).toBe(1);
  release();
  await expect(patientCount(page)).toHaveText('4');
  expect(clinic.state.refreshCount).toBe(1);
  for (const path of paths) expect(clinic.state.successfulRequests.some(request => request.path === path && request.token === `Bearer ${clinic.currentAccessToken()}`)).toBe(true);
  const claims = JSON.parse(Buffer.from(clinic.currentAccessToken().split('.')[1], 'base64url').toString());
  expect(claims).toMatchObject({ sub: userId, session_id: sessionId });
  await expectStillSignedIn(page, clinic.state);
});

test('eleven minutes of idle time and a focus refresh keep the dashboard signed in', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const clinic = await mockClinic(page);
  clinic.state.authExpiresIn = 300;
  await openDashboard(page);
  await page.clock.fastForward(11 * 60 * 1000);
  clinic.state.patients = 5;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(patientCount(page)).toHaveText('5');
  await expectStillSignedIn(page, clinic.state);
  expect(clinic.state.refreshCount).toBeGreaterThan(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Clinic Overview' })).toBeVisible();
  await expect(patientCount(page)).toHaveText('5');
  await expectStillSignedIn(page, clinic.state);
});

test('a failed SDK token renewal preserves credentials and never sends anonymous clinic requests', async ({ page }) => {
  test.setTimeout(45000);
  await page.clock.install({ time: new Date() });
  const clinic = await mockClinic(page);
  clinic.state.authExpiresIn = 300;
  await openDashboard(page);
  clinic.state.refreshUnavailable = true;
  // Move past token expiry, then let the SDK's retry window elapse quickly.
  await page.clock.setSystemTime(new Date(Date.now() + 6 * 60 * 1000));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => clinic.state.refreshCount).toBeGreaterThan(0);
  await page.clock.setSystemTime(new Date(Date.now() + 7 * 60 * 1000));
  await page.clock.runFor(1000);
  await expect(page.getByRole('alert')).toContainText('Unable to renew your session right now.');
  await expectStillSignedIn(page, clinic.state);
  expect(clinic.state.successfulRequests.every(request => request.token?.startsWith('Bearer '))).toBe(true);
  clinic.state.refreshUnavailable = false;
  clinic.state.patients = 8;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(patientCount(page)).toHaveText('8');
  await expectStillSignedIn(page, clinic.state);
});

test('a transient API outage preserves the dashboard and recovers without another login', async ({ page }) => {
  const clinic = await mockClinic(page);
  await openDashboard(page);
  clinic.state.unavailablePaths.add('/api/analytics');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Clinic service temporarily unavailable.');
  await expectStillSignedIn(page, clinic.state);
  clinic.state.unavailablePaths.clear();
  clinic.state.patients = 6;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(patientCount(page)).toHaveText('6');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(clinic.state.refreshCount).toBe(0);
  await expectStillSignedIn(page, clinic.state);
});

test('the sidebar Sign Out button ends verification and stays signed out after reload', async ({ page }) => {
  const clinic = await mockClinic(page);
  await openDashboard(page);
  await expectStillSignedIn(page, clinic.state);
  await page.locator('.admin-sidebar').getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  expect(clinic.state.authLogoutCount).toBe(1);
  expect(clinic.state.apiLogoutCount).toBe(1);
  expect(clinic.state.verified).toBe(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  expect(clinic.state.authLogoutCount).toBe(1);
  expect(clinic.state.refreshCount).toBe(0);
});

test('a delayed invalid response from the previous account cannot logout or replay under a new account', async ({ page }) => {
  const clinic = await mockClinic(page);
  await openDashboard(page);
  clinic.expireAccessToken(['/api/analytics']);
  const release = clinic.holdRejection();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => clinic.state.rejectedRequests.length).toBe(1);
  await page.locator('.admin-sidebar').getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  clinic.switchAccount();
  await openDashboard(page, false, 'second-admin@example.invalid');
  await expect(page.locator('.admin-user-chip')).toContainText('Second Session Test Administrator');
  const requestsBeforeRelease = clinic.state.successfulRequests.length;
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/analytics') && response.status() === 401);
  release();
  await (await oldResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.locator('.admin-user-chip')).toContainText('Second Session Test Administrator');
  await expect(page.locator('.admin-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0);
  expect(clinic.state.refreshCount).toBe(0);
  expect(clinic.state.authLogoutCount).toBe(1);
  expect(clinic.state.apiLogoutCount).toBe(1);
  expect(clinic.state.successfulRequests.length).toBe(requestsBeforeRelease);
});

test('a delayed verification error cannot revoke a fresh OTP for the same user and access token', async ({ page }) => {
  const clinic = await mockClinic(page);
  await openDashboard(page);
  const originalToken = clinic.currentAccessToken();
  clinic.state.otpRequiredPaths.add('/api/analytics');
  const release = clinic.holdOtpResponse('/api/analytics');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => clinic.state.otpRequiredRequests.length).toBe(1);

  // A second, current request requires verification while the older response
  // remains in flight. Completing that OTP keeps this Supabase session/token.
  clinic.state.otpRequiredPaths.delete('/api/analytics');
  clinic.state.otpRequiredPaths.add('/api/doctors');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  clinic.state.otpRequiredPaths.clear();
  clinic.state.patients = 7;
  await page.getByLabel('6-Digit Code').fill('123456');
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Clinic Overview' })).toBeVisible();
  await expect(patientCount(page)).toHaveText('7');
  expect(clinic.currentAccessToken()).toBe(originalToken);

  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/analytics') && response.status() === 428);
  release();
  await (await oldResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(patientCount(page)).toHaveText('7');
  await expectStillSignedIn(page, clinic.state);
  expect(clinic.state.refreshCount).toBe(0);
});
