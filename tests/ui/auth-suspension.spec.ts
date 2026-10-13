import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000011';
const sessionId = '00000000-0000-4000-8000-000000000012';
const email = 'suspension-test@example.invalid';
const contactEmail = 'luckypinga077@gmail.com';

function passwordSessionId(loginCount: number) {
  return `00000000-0000-4000-8000-${String(12 + loginCount).padStart(12, '0')}`;
}

async function mockServices(page: Page) {
  const state = {
    tokenFailure: null as 'user_banned' | 'invalid_credentials' | null,
    profileFailure: null as 'disabled' | 'unavailable' | 'network' | null,
    activeSessionId: sessionId,
    passwordLoginCount: 0,
    verifiedSessions: new Set<string>(),
    verificationRequests: [] as string[],
    verificationGate: undefined as Promise<void> | undefined,
    authLogoutCount: 0,
    otpSendCount: 0,
    profileCount: 0,
    profileGates: new Map<string, Promise<void>>(),
    heldProfileResponses: new Map<string, 'permanent403' | 'mismatchedPatient'>(),
    heldProfileRequests: [] as string[],
    finishedHeldProfiles: [] as string[],
    statusGate: undefined as Promise<void> | undefined,
    apiRequests: [] as Array<{ path: string; authorization?: string }>,
  };
  const user = {
    id: userId, email, aud: 'authenticated', role: 'authenticated',
    app_metadata: { clinic_role: 'admin' }, user_metadata: {},
    created_at: '2026-10-13T00:00:00Z', email_confirmed_at: '2026-10-13T00:00:00Z',
  };
  const profile = { id: userId, email, role: 'admin', full_name: 'Suspension Test', phone: null, user_type: null };
  const authResponse = () => {
    const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: state.activeSessionId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
    return { access_token: `e30.${payload}.fixture-signature`, refresh_token: `fixture-refresh-${state.passwordLoginCount}`, expires_in: 3600, token_type: 'bearer', user };
  };
  function requestSession(authorization: string | undefined): string {
    const payload = authorization?.replace(/^Bearer\s+/i, '').split('.')[1];
    if (!payload) throw new Error('Fixture requires an authenticated request.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).session_id;
  }

  // No identity lookup or provider request reaches a live service.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/logout')) {
        state.authLogoutCount += 1;
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith('/token') && url.searchParams.get('grant_type') === 'password' && state.tokenFailure) {
        return route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'X-Supabase-Api-Version' }, json: {
          code: state.tokenFailure,
          message: state.tokenFailure === 'user_banned' ? 'User is banned' : 'Invalid login credentials',
        } });
      }
      if (path.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        state.passwordLoginCount += 1;
        state.activeSessionId = passwordSessionId(state.passwordLoginCount);
      }
      return route.fulfill({ json: path.endsWith('/user') ? user : authResponse() });
    }
    if (path.startsWith('/auth/') || path.startsWith('/api/')) {
      state.apiRequests.push({ path, authorization: route.request().headers().authorization });
      if (path === '/auth/profile') {
        state.profileCount += 1;
        const requestedSession = requestSession(route.request().headers().authorization);
        const profileGate = state.profileGates.get(requestedSession);
        if (profileGate) {
          state.heldProfileRequests.push(requestedSession);
          await profileGate;
          try {
            if (state.heldProfileResponses.get(requestedSession) === 'permanent403') {
              return await route.fulfill({ status: 403, json: { error: 'A valid account profile is required.' } });
            }
            return await route.fulfill({ json: { data: { ...profile, role: 'patient', user_type: 'Student' } } });
          } finally { state.finishedHeldProfiles.push(requestedSession); }
        }
        if (state.profileFailure === 'network') return route.abort('connectionfailed');
        if (state.profileFailure === 'disabled') return route.fulfill({ status: 403, json: { code: 'ACCOUNT_DISABLED', error: 'This account has been deactivated. Contact the clinic administrator.' } });
        if (state.profileFailure === 'unavailable') return route.fulfill({ status: 503, json: { error: 'Unable to validate your session right now.' } });
        return route.fulfill({ json: { data: profile } });
      }
      if (path === '/auth/otp/status') {
        const requestedSession = requestSession(route.request().headers().authorization);
        await state.statusGate;
        return route.fulfill({ json: { verified: state.verifiedSessions.has(requestedSession) } });
      }
      if (path === '/auth/otp/send') {
        state.otpSendCount += 1;
        return route.fulfill({ status: 202, json: { deliveryMode: 'email', destination: 'su***@example.invalid', message: 'Fixture verification code accepted.' } });
      }
      if (path === '/auth/otp/verify') {
        const requestedSession = requestSession(route.request().headers().authorization);
        state.verificationRequests.push(requestedSession);
        await state.verificationGate;
        state.verifiedSessions.add(requestedSession);
        return route.fulfill({ json: { message: 'Verified' } });
      }
      if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture uses polling.' } });
      if (path === '/api/clinic/settings') return route.fulfill({ json: { data: { timezone: 'Africa/Johannesburg', opens_at: '08:00:00', closes_at: '17:00:00', default_appointment_minutes: 30, minimum_reschedule_notice_hours: 2 } } });
      if (path === '/api/analytics') return route.fulfill({ json: { data: { patients: 0, doctors: 0, staff: 0, appointmentsToday: 0, pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0, pendingLeaveRequests: 0, dailyAppointments: [] } } });
      return route.fulfill({ json: { data: [] } });
    }
    if (url.origin === 'http://127.0.0.1:5178') return route.continue();
    return route.abort();
  });
  return state;
}

async function signIn(page: Page, navigate = true) {
  if (navigate) await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Admin / }).click();
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

async function openDashboard(page: Page) {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await page.getByLabel('6-Digit Code').fill('123456');
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Clinic Overview' })).toBeVisible();
}

async function expectSuspendedLogin(page: Page) {
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Your account has been suspended');
  await expect(alert).toContainText('Contact admin');
  await expect(alert.getByRole('link', { name: contactEmail })).toHaveAttribute('href', `mailto:${contactEmail}`);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
}

test('a Supabase user_banned credential response shows the suspension contact without public account lookups', async ({ page }) => {
  const state = await mockServices(page);
  state.tokenFailure = 'user_banned';
  await signIn(page);
  await expectSuspendedLogin(page);
  expect(state.profileCount).toBe(0);
  expect(state.otpSendCount).toBe(0);
  expect(state.apiRequests).toEqual([]);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
});

test('a trusted disabled profile blocks sign-in and preserves its contact alert after credential cleanup', async ({ page }) => {
  const state = await mockServices(page);
  state.profileFailure = 'disabled';
  await signIn(page);
  await expectSuspendedLogin(page);
  await expect.poll(() => state.authLogoutCount).toBe(1);
  expect(state.otpSendCount).toBe(0);
  expect(state.apiRequests.every(request => request.authorization?.startsWith('Bearer '))).toBe(true);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.endsWith('-auth-token')).length)).toBe(0);
  await expectSuspendedLogin(page);
});

test('restoring a disabled account returns to login with the suspension contact instead of a dashboard', async ({ page }) => {
  const state = await mockServices(page);
  await openDashboard(page);
  state.profileFailure = 'disabled';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectSuspendedLogin(page);
  await expect.poll(() => state.authLogoutCount).toBe(1);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.endsWith('-auth-token')).length)).toBe(0);
  await expectSuspendedLogin(page);
});

test('invalid credentials keep their ordinary error and do not claim an account was suspended', async ({ page }) => {
  const state = await mockServices(page);
  state.tokenFailure = 'invalid_credentials';
  await signIn(page);
  await expect(page.getByRole('alert')).toHaveText('Invalid login credentials');
  await expect(page.getByRole('link', { name: contactEmail })).toHaveCount(0);
  await expect(page.getByText('Your account has been suspended', { exact: true })).toHaveCount(0);
  expect(state.apiRequests).toEqual([]);
  expect(state.authLogoutCount).toBe(0);
});

test('a transient profile failure after valid credentials preserves the session for a sign-in retry', async ({ page }) => {
  const state = await mockServices(page);
  state.profileFailure = 'unavailable';
  await signIn(page);
  await expect(page.getByRole('alert')).toHaveText('Unable to validate your session right now.');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  const firstSession = state.activeSessionId;
  expect(state.passwordLoginCount).toBe(1);
  expect(state.otpSendCount).toBe(0);
  expect(state.authLogoutCount).toBe(0);
  expect(state.apiRequests.every(request => request.authorization?.startsWith('Bearer '))).toBe(true);

  state.profileFailure = null;
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Fixture verification code accepted.');
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  expect(state.activeSessionId).not.toBe(firstSession);
  expect(state.passwordLoginCount).toBe(2);
  expect(state.otpSendCount).toBe(1);
  expect(state.authLogoutCount).toBe(0);
});

test('a transient profile service failure during restoration retains the session and its real error', async ({ page }) => {
  const state = await mockServices(page);
  await openDashboard(page);
  state.profileFailure = 'unavailable';
  let releaseStatus!: () => void;
  state.statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await expect(page.getByRole('alert')).toHaveText('Unable to validate your session right now.');
  } finally {
    releaseStatus();
  }
  await expect(page.getByRole('heading', { name: 'Account profile unavailable' })).toBeVisible();
  await expect(page.getByText('Unable to validate your session right now.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: contactEmail })).toHaveCount(0);
  await expect(page.getByText('Your account has been suspended', { exact: true })).toHaveCount(0);
  expect(state.authLogoutCount).toBe(0);
  expect(state.apiRequests.every(request => request.authorization?.startsWith('Bearer '))).toBe(true);
});

test('a temporary profile network failure retains credentials and retries under a new session without skipping OTP', async ({ page }) => {
  const state = await mockServices(page);
  state.profileFailure = 'network';
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText(/fetch|network|load/i);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  expect(state.authLogoutCount).toBe(0);
  expect(state.otpSendCount).toBe(0);
  const firstSession = state.activeSessionId;

  state.profileFailure = null;
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Fixture verification code accepted.');
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  expect(state.activeSessionId).not.toBe(firstSession);
  expect(state.passwordLoginCount).toBe(2);
  expect(state.otpSendCount).toBe(1);
  expect(state.authLogoutCount).toBe(0);
});

test('a profile-outage retry still rejects a selected role that does not match the trusted account', async ({ page }) => {
  const state = await mockServices(page);
  state.profileFailure = 'unavailable';
  await signIn(page);
  await expect(page.getByRole('alert')).toHaveText('Unable to validate your session right now.');
  const firstSession = state.activeSessionId;
  state.profileFailure = null;
  await page.getByRole('button', { name: /^Doctor / }).click();
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('registered as a admin, not as a doctor');
  await expect(page.getByRole('button', { name: /^Doctor / })).toHaveClass(/selected/);
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  await expect.poll(() => state.authLogoutCount).toBe(1);
  expect(state.activeSessionId).not.toBe(firstSession);
  expect(state.passwordLoginCount).toBe(2);
  expect(state.otpSendCount).toBe(0);
});

test('an older successful OTP response cannot verify a new session for the same user', async ({ page }) => {
  const state = await mockServices(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  const firstSession = state.activeSessionId;
  let releaseVerification!: () => void;
  state.verificationGate = new Promise<void>(resolve => { releaseVerification = resolve; });
  try {
    await page.getByLabel('6-Digit Code').fill('123456');
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect.poll(() => state.verificationRequests).toEqual([firstSession]);

    // End the old Auth session while its accepted verification response is
    // in flight. Re-entering through the existing registration/back controls
    // mounts a fresh login form without reloading away the pending request.
    await page.evaluate(() => window.dispatchEvent(new Event('clinic:session-expired')));
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await page.getByRole('button', { name: 'Create one now' }).click();
    await expect(page.getByRole('heading', { name: 'Create your clinic account' })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await signIn(page, false);
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
    const replacementSession = state.activeSessionId;
    expect(replacementSession).not.toBe(firstSession);
    expect(state.passwordLoginCount).toBe(2);

    const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/otp/verify');
    state.verificationGate = undefined;
    releaseVerification();
    await (await oldResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(state.verifiedSessions.has(firstSession)).toBe(true);
    expect(state.verifiedSessions.has(replacementSession)).toBe(false);
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
    await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
    expect(state.authLogoutCount).toBe(1);

    await page.getByLabel('6-Digit Code').fill('654321');
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Clinic Overview' })).toBeVisible();
    expect(state.verificationRequests).toEqual([firstSession, replacementSession]);
    expect(state.verifiedSessions.has(replacementSession)).toBe(true);
  } finally {
    state.verificationGate = undefined;
    releaseVerification();
  }
});

for (const responseKind of ['permanent403', 'mismatchedPatient'] as const) {
  test(`an old sign-in profile ${responseKind} response cannot replace or sign out a newer login`, async ({ page }) => {
    const state = await mockServices(page);
    const firstSession = passwordSessionId(1);
    let releaseProfiles!: () => void;
    state.profileGates.set(firstSession, new Promise<void>(resolve => { releaseProfiles = resolve; }));
    state.heldProfileResponses.set(firstSession, responseKind);
    try {
      await signIn(page);
      // Hold both the sign-in validation and the initial profile effect for
      // the captured old session, while the newer login remains unblocked.
      await expect.poll(() => state.heldProfileRequests.filter(id => id === firstSession).length).toBeGreaterThanOrEqual(2);
      expect(state.otpSendCount).toBe(0);
      await page.getByRole('button', { name: 'Create one now' }).click();
      await expect(page.getByRole('heading', { name: 'Create your clinic account' })).toBeVisible();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await signIn(page, false);
      await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('Fixture verification code accepted.');
      const replacementSession = state.activeSessionId;
      expect(replacementSession).not.toBe(firstSession);
      expect(state.passwordLoginCount).toBe(2);
      expect(state.otpSendCount).toBe(1);
      expect(state.authLogoutCount).toBe(0);
      const heldRequestCount = state.heldProfileRequests.filter(id => id === firstSession).length;

      releaseProfiles();
      await expect.poll(() => state.finishedHeldProfiles.filter(id => id === firstSession).length).toBeGreaterThanOrEqual(heldRequestCount);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
      expect(state.activeSessionId).toBe(replacementSession);
      expect(state.otpSendCount).toBe(1);
      expect(state.authLogoutCount).toBe(0);

      await page.getByLabel('6-Digit Code').fill('654321');
      await page.getByRole('button', { name: 'Verify & Sign In' }).click();
      await expect(page.getByRole('heading', { name: 'Clinic Overview' })).toBeVisible();
      expect(state.verificationRequests).toEqual([replacementSession]);
      expect(state.otpSendCount).toBe(1);
      expect(state.authLogoutCount).toBe(0);
    } finally { releaseProfiles(); }
  });
}
