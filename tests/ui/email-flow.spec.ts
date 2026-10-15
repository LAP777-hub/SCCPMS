import { Buffer } from 'node:buffer';
import { expect, test, type Page, type Route } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000071';
const inviteSessionId = '00000000-0000-4000-8000-000000000072';
const newPassword = 'My own clinic password 123!';
const timeoutMessage = 'The account service took too long to respond. Please try again.';
type Challenge = { destination: string; expiresAt: string; expiresInSeconds: number };

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function fulfill(route: Route, response: Parameters<Route['fulfill']>[0]) {
  try { await route.fulfill(response); }
  catch (error) { if (!route.request().failure()) throw error; }
}

async function mockEmailFlow(page: Page, role = 'doctor') {
  const account = {
    id: userId, email: `${role}@spu.ac.za`, aud: 'authenticated', role: 'authenticated',
    app_metadata: { clinic_role: role }, user_metadata: {}, created_at: '2026-10-14T00:00:00Z',
    email_confirmed_at: '2026-10-14T00:00:00Z',
  };
  const state = {
    providerOrigin: '', activeSessionId: inviteSessionId,
    registrations: [] as Array<{ authorization?: string }>,
    verifyLinkCount: 0, passwordUpdates: [] as Record<string, unknown>[],
    passwordLogins: [] as Record<string, unknown>[], authLogoutCount: 0, apiLogoutCount: 0,
    otpSendCount: 0, otpVerifyCount: 0, statusCount: 0,
    validitySeconds: 600, cooldownSeconds: 30,
    activeChallenges: new Map<string, Challenge>(), verifiedSessions: new Set<string>(),
    sendGate: undefined as Promise<void> | undefined,
    statusGate: undefined as Promise<void> | undefined,
    passwordGate: undefined as Promise<void> | undefined,
    userGate: undefined as Promise<void> | undefined,
    signInGate: undefined as Promise<void> | undefined,
    apiLogoutGate: undefined as Promise<void> | undefined,
    authLogoutGate: undefined as Promise<void> | undefined,
    authLogoutUnavailable: false,
    sendFailure: undefined as { status: number; error: string; retryAfterSeconds?: number; activeChallenge?: Challenge | null } | undefined,
    failedAuthRequests: [] as string[],
  };
  const token = (session = state.activeSessionId) => `e30.${Buffer.from(JSON.stringify({
    sub: userId, session_id: session, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')}.fixture-signature`;
  const authResponse = () => ({ access_token: token(), refresh_token: `fixture-refresh-${state.passwordLogins.length}`, token_type: 'bearer', expires_in: 3600, user: account });
  const fragment = (kind = 'invite') => new URLSearchParams({ access_token: token(inviteSessionId), refresh_token: 'fixture-invite-refresh', token_type: 'bearer', expires_in: '3600', type: kind }).toString();
  const requestSession = (route: Route) => {
    const authorization = route.request().headers().authorization;
    if (!authorization) throw new Error('Fixture requires Bearer credentials.');
    return JSON.parse(Buffer.from(authorization.split('.')[1], 'base64url').toString()).session_id as string;
  };
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/auth/v1/')) state.failedAuthRequests.push(new URL(request.url()).pathname);
  });
  await page.context().route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      state.providerOrigin = url.origin;
      if (path === '/auth/v1/verify') {
        state.verifyLinkCount += 1;
        const target = new URL(url.searchParams.get('redirect_to')!);
        target.hash = fragment(url.searchParams.get('type') === 'email' ? 'signup' : url.searchParams.get('type')!);
        return fulfill(route, { status: 302, headers: { location: target.toString() }, body: '' });
      }
      if (path.endsWith('/recover')) return fulfill(route, { json: {} });
      if (path.endsWith('/logout')) {
        state.authLogoutCount += 1;
        await state.authLogoutGate;
        return fulfill(route, { status: state.authLogoutUnavailable ? 503 : 204, ...(state.authLogoutUnavailable ? { json: { message: 'Fixture logout outage.' } } : {}) });
      }
      if (path.endsWith('/user')) {
        if (request.method() === 'PUT') { state.passwordUpdates.push(request.postDataJSON()); await state.passwordGate; }
        else await state.userGate;
        return fulfill(route, { json: account });
      }
      if (url.searchParams.get('grant_type') === 'password') {
        state.passwordLogins.push(request.postDataJSON());
        await state.signInGate;
        state.activeSessionId = `00000000-0000-4000-8000-${String(72 + state.passwordLogins.length).padStart(12, '0')}`;
      }
      return fulfill(route, { json: authResponse() });
    }
    if (path.startsWith('/auth/') || path.startsWith('/api/')) {
      if (path === '/auth/register') {
        state.registrations.push({ authorization: request.headers().authorization });
        return fulfill(route, { status: 201, json: { message: 'Fixture registration accepted.' } });
      }
      if (path === '/auth/profile') return fulfill(route, { json: { data: { id: userId, email: account.email, role, full_name: 'Invited Staff Fixture', phone: null, user_type: null } } });
      if (path === '/auth/logout') {
        state.apiLogoutCount += 1;
        await state.apiLogoutGate;
        return fulfill(route, { json: { message: 'Fixture verification ended.' } });
      }
      if (path === '/auth/invitation/complete') { state.passwordUpdates.push(request.postDataJSON()); await state.passwordGate; return fulfill(route, { json: { message: 'Invitation accepted fixture' } }); }
      if (path === '/auth/otp/status') {
        const session = requestSession(route);
        state.statusCount += 1;
        const snapshot = { verified: state.verifiedSessions.has(session), activeChallenge: state.activeChallenges.get(session) ?? null, retryAfterSeconds: 0 };
        await state.statusGate;
        return fulfill(route, { json: snapshot });
      }
      if (path === '/auth/otp/send') {
        const session = requestSession(route);
        state.otpSendCount += 1;
        const failure = state.sendFailure;
        await state.sendGate;
        if (failure) return failure.status === 0 ? route.abort('connectionfailed') : fulfill(route, { status: failure.status, json: failure });
        const now = await page.evaluate(() => Date.now());
        const challenge = { destination: `${role.slice(0, 2)}***@spu.ac.za`, expiresAt: new Date(now + state.validitySeconds * 1000).toISOString(), expiresInSeconds: state.validitySeconds };
        state.activeChallenges.set(session, challenge);
        return fulfill(route, { status: 202, json: { ...challenge, deliveryMode: 'email', message: 'Fixture code accepted by the email provider.', retryAfterSeconds: state.cooldownSeconds } });
      }
      if (path === '/auth/otp/verify') {
        state.otpVerifyCount += 1;
        state.verifiedSessions.add(requestSession(route));
        return fulfill(route, { json: { message: 'Verified' } });
      }
      if (path === '/api/events') return fulfill(route, { status: 503, json: { error: 'Fixture uses polling.' } });
      if (path === '/api/clinic/settings') return fulfill(route, { json: { data: { timezone: 'Africa/Johannesburg', opens_at: '08:00:00', closes_at: '17:00:00', default_appointment_minutes: 30, minimum_reschedule_notice_hours: 2 } } });
      if (path === '/api/analytics') return fulfill(route, { json: { data: { patients: 0, doctors: 0, staff: 0, appointmentsToday: 0, pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0, pendingLeaveRequests: 0, dailyAppointments: [] } } });
      return fulfill(route, { json: { data: [] } });
    }
    if (path === '/registration/addresses') return fulfill(route, { json: { data: [] } });
    if (url.origin === 'http://127.0.0.1:5178') return route.continue();
    return route.abort();
  });
  return { state, account, fragment, token, authResponse };
}

async function learnProviderOrigin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email Address').fill('fixture@spu.ac.za');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

async function credentials(page: Page, role = 'doctor') {
  await page.getByRole('button', { name: new RegExp(`^${role} `, 'i') }).click();
  await page.getByLabel('Email Address').fill(`${role}@spu.ac.za`);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

async function setPassword(page: Page) {
  await page.getByLabel('New Password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Update Password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
}

for (const role of ['doctor', 'receptionist']) {
  test(`${role} accepts a protected email link, chooses a password, and reaches its dashboard only after new credentials and OTP`, async ({ page }) => {
    const fixture = await mockEmailFlow(page, role);
    await learnProviderOrigin(page);
    const origin = new URL(page.url()).origin;
    const verification = new URL('/auth/v1/verify', fixture.state.providerOrigin);
    verification.search = new URLSearchParams({ token: 'a'.repeat(64), type: 'invite', redirect_to: `${origin}/?auth_action=invite` }).toString();
    const query = new URLSearchParams({ email_action: 'invite', confirmation_url: verification.toString() });
    await page.goto(`/?${query}`);
    await expect(page.getByRole('heading', { name: 'Accept your clinic invitation' })).toBeVisible();
    expect(fixture.state.verifyLinkCount).toBe(0);
    await expect(page.locator('a[href*="/auth/v1/verify"]')).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
    expect(fixture.state.verifyLinkCount).toBe(1);
    expect(fixture.state.otpSendCount).toBe(0);
    await setPassword(page);
    expect(fixture.state.passwordUpdates).toEqual([expect.objectContaining({ password: newPassword })]);
    expect(fixture.state.passwordUpdates[0]).not.toHaveProperty('app_metadata');
    expect(fixture.state.passwordUpdates[0]).not.toHaveProperty('user_metadata');
    await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^${role} `, 'i') })).toHaveClass(/selected/);
    await expect(page.getByLabel('Email Address')).toHaveValue(`${role}@spu.ac.za`);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    expect(fixture.state.otpSendCount).toBe(0);
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Fixture code accepted by the email provider.');
    expect(fixture.state.passwordLogins).toEqual([{ email: `${role}@spu.ac.za`, password: newPassword, gotrue_meta_security: {} }]);
    expect(fixture.state.activeSessionId).not.toBe(inviteSessionId);
    await expect(page.locator('.doctor-shell,.reception-shell')).toHaveCount(0);
    await page.getByLabel('6-Digit Code').fill('123456');
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.locator(role === 'doctor' ? '.doctor-shell' : '.reception-shell')).toBeVisible();
    expect(fixture.state.otpVerifyCount).toBe(1);
  });
}

test('protected links reject other providers, redirects, actions, duplicate tokens and credential overlays without consuming a token', async ({ page }) => {
  const fixture = await mockEmailFlow(page);
  await learnProviderOrigin(page);
  const origin = new URL(page.url()).origin;
  const valid = new URL('/auth/v1/verify', fixture.state.providerOrigin);
  valid.search = new URLSearchParams({ token: 'a'.repeat(64), type: 'invite', redirect_to: `${origin}/?auth_action=invite` }).toString();
  const invalidLinks = [
    valid.toString().replace(fixture.state.providerOrigin, 'https://other-project.supabase.co'),
    valid.toString().replace('/auth/v1/verify', '/auth/v1/token'),
    `${valid}&token=${'b'.repeat(64)}`,
    `${valid}&token_hash=${'b'.repeat(64)}`,
    valid.toString().replace('type=invite', 'type=recovery'),
    (() => { const url = new URL(valid); url.searchParams.set('redirect_to', 'https://attacker.example/'); return url.toString(); })(),
  ];
  for (const link of invalidLinks) {
    await page.goto(`/?${new URLSearchParams({ email_action: 'invite', confirmation_url: link })}`);
    await expect(page.getByRole('alert')).toContainText('This account link is invalid');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    expect(fixture.state.verifyLinkCount).toBe(0);
  }
  await page.goto(`/?${new URLSearchParams({ email_action: 'invite', confirmation_url: valid.toString(), access_token: fixture.token() })}`);
  await expect(page.getByRole('alert')).toContainText('This account link is invalid');
  expect(new URL(page.url()).search).toBe('');
  expect(fixture.state.verifyLinkCount).toBe(0);
  expect(fixture.state.passwordUpdates).toEqual([]);
});

test('a signup email wrapper accepts the Supabase email type and returns to credentials without bypassing OTP', async ({ page }) => {
  const fixture = await mockEmailFlow(page, 'patient');
  await learnProviderOrigin(page);
  const origin = new URL(page.url()).origin;
  const verification = new URL('/auth/v1/verify', fixture.state.providerOrigin);
  verification.search = new URLSearchParams({ token: 'a'.repeat(64), type: 'email', redirect_to: origin }).toString();
  await page.goto(`/?${new URLSearchParams({ email_action: 'signup', confirmation_url: verification.toString() })}`);
  await expect(page.getByRole('heading', { name: 'Confirm your email address' })).toBeVisible();
  expect(fixture.state.verifyLinkCount).toBe(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Your email is confirmed. Sign in with your password');
  await expect(page.getByLabel('Email Address')).toHaveValue('patient@spu.ac.za');
  await expect(page.locator('.patient-shell,.doctor-shell,.reception-shell')).toHaveCount(0);
  expect(fixture.state.verifyLinkCount).toBe(1);
  expect(fixture.state.otpSendCount).toBe(0);
  expect(fixture.state.passwordUpdates).toEqual([]);
});

test('a timed-out callback account request explains the outage and offers recovery without claiming an expired or accepted link', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  const userCheck = gate();
  fixture.state.userGate = userCheck.promise;
  try {
    await page.goto(`/?auth_action=invite#${fixture.fragment()}`);
    await expect.poll(() => fixture.state.providerOrigin).not.toBe('');
    await page.clock.fastForward(12_100);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('The account service is unavailable right now. Check your connection and try again. If this one-use email link was already consumed, use Forgot password to request a fresh account link.');
    await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
    expect(fixture.state.otpSendCount).toBe(0);
    userCheck.release();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email Address').fill('doctor@spu.ac.za');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  } finally { userCheck.release(); }
});

test('a stalled credential request is aborted at twelve seconds and a retry cannot receive its old session', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  const blocked = gate();
  fixture.state.signInGate = blocked.promise;
  try {
    await page.goto('/');
    await credentials(page);
    await expect.poll(() => fixture.state.passwordLogins.length).toBe(1);
    await page.clock.fastForward(12_100);
    await expect(page.getByRole('alert')).toHaveText(timeoutMessage);
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
    await expect.poll(() => fixture.state.failedAuthRequests).toContain('/auth/v1/token');
    fixture.state.signInGate = undefined;
    blocked.release();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Fixture code accepted by the email provider.');
    expect(fixture.state.passwordLogins).toHaveLength(2);
    expect(fixture.state.otpSendCount).toBe(1);
    await expect(page.locator('.doctor-shell')).toHaveCount(0);
  } finally { blocked.release(); }
});

test('a stalled password update stops its spinner, keeps invitation setup, and allows retry', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  await page.goto(`/?auth_action=invite#${fixture.fragment()}`);
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  const blocked = gate();
  fixture.state.passwordGate = blocked.promise;
  try {
    await page.getByLabel('New Password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect.poll(() => fixture.state.passwordUpdates.length).toBe(1);
    await page.clock.fastForward(12_100);
    await expect(page.getByRole('alert')).toHaveText(timeoutMessage);
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
    expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).not.toBeNull();
    expect(fixture.state.otpSendCount).toBe(0);
    fixture.state.passwordGate = undefined;
    blocked.release();
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(fixture.state.passwordUpdates).toHaveLength(2);
  } finally { blocked.release(); }
});

test('OTP expiry begins after provider acceptance and a failed resend preserves the accepted code and its original deadline', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  fixture.state.validitySeconds = 73;
  fixture.state.cooldownSeconds = 7;
  const delivery = gate();
  fixture.state.sendGate = delivery.promise;
  try {
    await page.goto('/');
    await credentials(page);
    await expect.poll(() => fixture.state.otpSendCount).toBe(1);
    await expect(page.getByTestId('otp-expiry')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sending code...' })).toBeDisabled();
    await page.clock.fastForward(20_000);
    await expect(page.getByTestId('otp-expiry')).toHaveCount(0);
    fixture.state.sendGate = undefined;
    delivery.release();
    await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 1:13.');
    await expect(page.getByRole('button', { name: 'Resend in 7s' })).toBeDisabled();
    await page.clock.fastForward(8_000);
    await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 1:05.');
    await page.getByLabel('6-Digit Code').fill('123456');
    const accepted = fixture.state.activeChallenges.get(fixture.state.activeSessionId)!;
    fixture.state.sendFailure = { status: 502, error: 'Fixture resend unavailable.', retryAfterSeconds: 2, activeChallenge: accepted };
    await page.getByRole('button', { name: 'Resend code', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Fixture resend unavailable.');
    await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 1:05.');
    await expect(page.getByLabel('6-Digit Code')).toHaveValue('123456');
    await expect(page.getByRole('button', { name: 'Verify & Sign In' })).toBeEnabled();
    await page.clock.fastForward(3_000);
    fixture.state.sendFailure = { status: 0, error: 'Fixture network outage.' };
    await page.getByRole('button', { name: 'Resend code', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/fetch|network|load/i);
    await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 1:02.');
    await expect(page.getByLabel('6-Digit Code')).toHaveValue('123456');
    await expect(page.getByRole('button', { name: 'Verify & Sign In' })).toBeEnabled();
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.locator('.doctor-shell')).toBeVisible();
  } finally { delivery.release(); }
});

test('an older status response without a challenge cannot erase a newer accepted code', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  fixture.state.cooldownSeconds = 0;
  await page.goto('/');
  await credentials(page);
  await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 10:00.');
  fixture.state.activeChallenges.clear();
  const oldStatus = gate();
  fixture.state.statusGate = oldStatus.promise;
  try {
    await page.reload();
    await expect.poll(() => fixture.state.statusCount).toBe(1);
    await expect(page.getByRole('button', { name: 'Verify & Sign In' })).toBeDisabled();
    await page.getByRole('button', { name: 'Resend code', exact: true }).click();
    await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 10:00.');
    const response = page.waitForResponse(candidate => new URL(candidate.url()).pathname === '/auth/otp/status');
    oldStatus.release();
    await (await response).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 10:00.');
    await expect(page.getByRole('button', { name: 'Verify & Sign In' })).toBeEnabled();
    expect(fixture.state.otpSendCount).toBe(2);
  } finally { oldStatus.release(); }
});

test('expired codes and an explicit no-active-challenge resend error disable verification without inventing a new timer', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  fixture.state.validitySeconds = 2;
  fixture.state.cooldownSeconds = 0;
  await page.goto('/');
  await credentials(page);
  await expect(page.getByTestId('otp-expiry')).toHaveText('Code expires in 0:02.');
  await page.clock.fastForward(3_000);
  await expect(page.getByTestId('otp-expiry')).toHaveText('This code has expired. Request a new code.');
  await expect(page.getByRole('button', { name: 'Verify & Sign In' })).toBeDisabled();
  fixture.state.sendFailure = { status: 502, error: 'No usable code remains.', retryAfterSeconds: 0, activeChallenge: null };
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('No usable code remains.');
  await expect(page.getByTestId('otp-expiry')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verify & Sign In' })).toBeDisabled();
  expect(fixture.state.otpVerifyCount).toBe(0);
});

test('returning from password setup clears local credentials even when the Auth logout service is unavailable', async ({ page }) => {
  const fixture = await mockEmailFlow(page);
  await page.goto(`/?auth_action=invite#${fixture.fragment()}`);
  await setPassword(page);
  fixture.state.authLogoutUnavailable = true;
  await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sb-') && key.endsWith('-auth-token')))).toEqual([]);
  expect(fixture.state.authLogoutCount).toBe(1);
  expect(fixture.state.apiLogoutCount).toBe(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  expect(fixture.state.otpSendCount).toBe(0);
});

test('a delayed setup logout cannot sign out a newer session established in another tab', async ({ page }) => {
  const fixture = await mockEmailFlow(page);
  await page.goto(`/?auth_action=invite#${fixture.fragment()}`);
  await setPassword(page);
  const logout = gate();
  fixture.state.apiLogoutGate = logout.promise;
  let otherPage: Page | undefined;
  try {
    await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
    await expect.poll(() => fixture.state.apiLogoutCount).toBe(1);
    await expect(page.getByRole('button', { name: 'Returning to sign in...' })).toBeDisabled();
    const replacementSession = '00000000-0000-4000-8000-000000000099';
    fixture.state.activeSessionId = replacementSession;
    const replacementToken = fixture.token(replacementSession);
    await page.evaluate(({ accessToken, session }) => {
      const key = Object.keys(localStorage).find(value => value.startsWith('sb-') && value.endsWith('-auth-token'));
      if (!key) throw new Error('No fixture Auth storage');
      const current = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...current, ...session, access_token: accessToken, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    }, { accessToken: replacementToken, session: fixture.authResponse() });
    // A second real SDK instance reads the fixture session and broadcasts its
    // SIGNED_IN event, exercising the original tab's ordinary session guards.
    otherPage = await page.context().newPage();
    await otherPage.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/logout');
    logout.release();
    await (await oldResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(fixture.state.authLogoutCount).toBe(0);
    const storedToken = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(value => value.startsWith('sb-') && value.endsWith('-auth-token'));
      return key ? JSON.parse(localStorage.getItem(key)!).access_token : null;
    });
    expect(storedToken).toBe(replacementToken);
    await expect(page.locator('.doctor-shell')).toHaveCount(0);
  } finally { logout.release(); await otherPage?.close(); }
});

test('setup logout attempts both services, bounds each stalled request, and clears local credentials', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  await page.goto(`/?auth_action=invite#${fixture.fragment()}`);
  await setPassword(page);
  const clinicLogout = gate();
  const authLogout = gate();
  fixture.state.apiLogoutGate = clinicLogout.promise;
  fixture.state.authLogoutGate = authLogout.promise;
  try {
    await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
    await expect.poll(() => fixture.state.apiLogoutCount).toBe(1);
    await page.clock.fastForward(3_100);
    await expect.poll(() => fixture.state.authLogoutCount).toBe(1);
    await page.clock.fastForward(3_100);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect.poll(() => fixture.state.failedAuthRequests).toContain('/auth/v1/logout');
    expect(fixture.state.apiLogoutCount).toBe(1);
    expect(fixture.state.authLogoutCount).toBe(1);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sb-') && key.endsWith('-auth-token')))).toEqual([]);
    expect(fixture.state.otpSendCount).toBe(0);
  } finally { clinicLogout.release(); authLogout.release(); }
});

test('blocked browser storage and a logout outage clear the SDK memory session before rerender and a new login', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Fixture storage is blocked.', 'SecurityError'); },
    });
  });
  await page.clock.install({ time: new Date() });
  const fixture = await mockEmailFlow(page);
  await page.goto(`/?auth_action=invite#${fixture.fragment()}`);
  await setPassword(page);
  fixture.state.authLogoutUnavailable = true;
  await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  expect(fixture.state.authLogoutCount).toBe(1);
  expect(fixture.state.apiLogoutCount).toBe(1);
  await page.clock.fastForward(31_000);
  await page.getByRole('button', { name: 'Create one now' }).click();
  await page.getByLabel('Full name').fill('Storage Regression Fixture');
  await page.getByLabel('Email address').fill('2014999999@spu.ac.za');
  await page.getByLabel('Phone (international format)').fill('+27123456789');
  await page.getByLabel('Student number').fill('2014999999');
  await page.getByLabel('Department', { exact: true }).selectOption('EMS');
  await page.getByRole('combobox', { name: 'Programme', exact: true }).fill('Accounting');
  await page.getByRole('option', { name: 'Bachelor of Commerce (BCom) in Accounting', exact: true }).click();
  await page.getByRole('combobox', { name: 'Residential Address', exact: true }).fill('10 Campus Road');
  await page.getByLabel('Password (at least 10 characters)').fill(newPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Fixture registration accepted.')).toBeVisible();
  // This app request calls SDK getSession. A surviving private-memory session
  // would attach the old Bearer token despite the already signed-out UI.
  expect(fixture.state.registrations).toEqual([{ authorization: undefined }]);
  expect(fixture.state.otpSendCount).toBe(0);
  await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
  await credentials(page);
  await expect(page.getByRole('status')).toHaveText('Fixture code accepted by the email provider.');
  expect(fixture.state.activeSessionId).not.toBe(inviteSessionId);
  await expect(page.locator('.doctor-shell')).toHaveCount(0);
  await page.getByLabel('6-Digit Code').fill('123456');
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.locator('.doctor-shell')).toBeVisible();
  expect(fixture.state.otpVerifyCount).toBe(1);
});
