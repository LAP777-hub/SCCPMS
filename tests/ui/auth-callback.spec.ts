import { test, expect, type Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000021';
const sessionId = '00000000-0000-4000-8000-000000000022';
const user = { id: userId, email: 'clinician@spu.ac.za', aud: 'authenticated', role: 'authenticated', app_metadata: { clinic_role: 'doctor' }, user_metadata: {}, created_at: new Date().toISOString() };
const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
const accessToken = `e30.${payload}.test`;

async function mockCallbackServices(page: Page, { role = 'doctor', verified = false }: { role?: string; verified?: boolean } = {}) {
  const updates: Record<string, unknown>[] = [];
  const apiRequests: string[] = [];
  const exchanges: Record<string, unknown>[] = [];
  const account = { ...user, email: `${role}@spu.ac.za`, email_confirmed_at: new Date().toISOString(), app_metadata: { clinic_role: role } };
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://images.pexels.com/**', route => route.abort());
  await page.route('**/auth/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (path.endsWith('/user')) {
      if (request.method() === 'PUT') updates.push(request.postDataJSON());
      return route.fulfill({ json: account });
    }
    if (new URL(request.url()).searchParams.get('grant_type') === 'pkce') exchanges.push(request.postDataJSON());
    return route.fulfill({ json: { access_token: accessToken, refresh_token: 'callback-refresh', token_type: 'bearer', expires_in: 3600, user: account } });
  });
  await page.route('**/localhost:4000/**', route => {
    const path = new URL(route.request().url()).pathname;
    apiRequests.push(path);
    if (path === '/auth/profile') return route.fulfill({ json: { data: { id: userId, role, email: account.email, full_name: 'Invited Clinician', phone: '+27123456789' } } });
    if (path === '/auth/invitation/complete') { updates.push(route.request().postDataJSON()); return route.fulfill({ json: { message: 'Accepted fixture' } }); }
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified } });
    return route.fulfill({ json: { data: [] } });
  });
  return { updates, apiRequests, exchanges };
}

function callbackFragment(kind?: string) {
  return new URLSearchParams({ access_token: accessToken, refresh_token: 'callback-refresh', expires_in: '3600', token_type: 'bearer', ...(kind ? { type: kind } : {}) });
}

for (const kind of ['invite', 'recovery']) {
  test(`${kind} password setup survives reload after callback tokens leave the URL`, async ({ page }) => {
    const { updates, apiRequests } = await mockCallbackServices(page);
    const fragment = new URLSearchParams({ access_token: accessToken, refresh_token: 'callback-refresh', expires_in: '3600', token_type: 'bearer', type: kind });
    await page.goto(`/#${fragment}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: kind === 'invite' ? 'Set your password' : 'Reset your password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
    expect(new URL(page.url()).hash).toBe('');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: kind === 'invite' ? 'Set your password' : 'Reset your password' })).toBeVisible();
    await page.getByLabel('New Password', { exact: true }).fill('new-clinic-password');
    await page.getByLabel('Confirm Password', { exact: true }).fill('new-clinic-password');
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ password: 'new-clinic-password' });
    expect(apiRequests).not.toContain('/auth/otp/send');
    expect(apiRequests).not.toContain('/auth/otp/status');
    await page.getByRole('button', { name: 'Return to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).toBeNull();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });
}

test('expired account links show safe recovery guidance and scrub callback details', async ({ page }) => {
  await mockCallbackServices(page);
  const fragment = new URLSearchParams({ error: 'access_denied', error_code: 'otp_expired', error_description: '<img src=x onerror=alert(1)> secret-url-token' });
  await page.goto(`/#${fragment}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('alert')).toHaveText('This account link has expired or is invalid. Request a new password reset link, or ask the clinic administrator to resend your invitation.');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await expect(page.getByText('secret-url-token')).toHaveCount(0);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
});

test('malformed invitations leave password setup and explain how to get a new link', async ({ page }) => {
  await mockCallbackServices(page);
  await page.goto('/#type=invite&access_token=invalid', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('This invitation link has expired or is invalid. Ask the clinic administrator to resend your invitation.');
  await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
});

test('password reset waits for delivery and prevents duplicate recovery requests', async ({ page }) => {
  await mockCallbackServices(page);
  let requests = 0;
  let redirectTarget: string | null = null;
  let release!: () => void;
  const delivery = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/auth/v1/recover**', async route => {
    requests += 1;
    redirectTarget = new URL(route.request().url()).searchParams.get('redirect_to');
    await delivery;
    await route.fulfill({ json: {} });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email Address').fill('clinician@spu.ac.za');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('button', { name: 'Sending reset link...' })).toBeDisabled();
  await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
  expect(requests).toBe(1);
  expect(redirectTarget).toBe(`${new URL(page.url()).origin}/?auth_action=recovery`);
  release();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(requests).toBe(1);
});

test('stored setup intent cannot apply to a different signed-in user', async ({ page }) => {
  await mockCallbackServices(page);
  const fragment = new URLSearchParams({ access_token: accessToken, refresh_token: 'callback-refresh', expires_in: '3600', token_type: 'bearer', type: 'invite' });
  await page.goto(`/#${fragment}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
  await page.evaluate((sessionId) => sessionStorage.setItem('sccpms:password-setup', JSON.stringify({ kind: 'invite', userId: '00000000-0000-4000-8000-000000000099', sessionId })), sessionId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).toBeNull();
});

for (const role of ['doctor', 'receptionist']) {
  test(`marked ${role} invitation opens password creation after its account is checked`, async ({ page }) => {
    const { apiRequests } = await mockCallbackServices(page, { role });
    await page.goto(`/?auth_action=invite#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
    await expect(page.getByText(`Account: ${role}@spu.ac.za`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
    expect(apiRequests).toContain('/auth/profile');
    expect(apiRequests).not.toContain('/auth/otp/status');
    expect(apiRequests).not.toContain('/auth/otp/send');
    expect(new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).hash).toBe('');
  });
}

test('marked recovery without fragment type still opens password reset', async ({ page }) => {
  await mockCallbackServices(page);
  await page.goto(`/?auth_action=recovery#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
});

test('successful signup confirmation returns to sign-in with a clear notice and keeps OTP required', async ({ page }) => {
  const { apiRequests, updates } = await mockCallbackServices(page, { role: 'patient' });
  await page.goto(`/?auth_action=signup#${callbackFragment('signup')}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Your email is confirmed. Sign in with your password, then enter the email verification code to open your dashboard.');
  await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
  await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
  expect(apiRequests).toContain('/auth/profile');
  expect(apiRequests).not.toContain('/auth/otp/status');
  expect(apiRequests).not.toContain('/auth/otp/send');
  expect(updates).toEqual([]);
  expect(new URL(page.url()).search).toBe('');
  expect(new URL(page.url()).hash).toBe('');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
});

for (const kind of ['invite', 'recovery']) {
  test(`a ${kind} marker alone cannot use an older login as password setup`, async ({ page }) => {
    await mockCallbackServices(page);
    await page.goto(`/#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
    await page.goto(`/?auth_action=${kind}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(kind === 'invite' ? 'invitation link has expired or is invalid' : 'password reset link has expired or is invalid');
    await expect(page.getByRole('button', { name: 'Update Password' })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).toBeNull();
  });
}

test('an unexchanged code callback cannot replace an already verified dashboard session', async ({ page }) => {
  const { exchanges } = await mockCallbackServices(page, { verified: true });
  await page.goto(`/#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.admin-shell')).toBeVisible();
  await page.goto('/?auth_action=invite&code=expired-code', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.admin-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
  expect(exchanges).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).toBeNull();
  expect(new URL(page.url()).search).toBe('');
});

test('a PKCE callback needs the local verifier and uses the supported invitation marker', async ({ page }) => {
  const { exchanges } = await mockCallbackServices(page);
  await page.goto(`/#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await page.evaluate(() => {
    const sessionKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (!sessionKey) throw new Error('No browser session key');
    localStorage.setItem(`${sessionKey}-code-verifier`, JSON.stringify('browser-code-verifier'));
  });
  await page.goto('/?auth_action=invite&code=valid-invitation-code', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
  expect(exchanges).toEqual([{ auth_code: 'valid-invitation-code', code_verifier: 'browser-code-verifier' }]);
  expect(new URL(page.url()).search).toBe('');
});

test('an account check outage keeps the consumed invitation retryable after reload', async ({ page }) => {
  const { apiRequests } = await mockCallbackServices(page);
  let checks = 0;
  await page.route('**/localhost:4000/auth/profile', route => {
    checks += 1;
    return checks === 1
      ? route.fulfill({ status: 503, json: { error: 'Account service temporarily unavailable.' } })
      : route.fulfill({ json: { data: { id: userId, role: 'doctor', email: 'doctor@spu.ac.za', full_name: 'Invited Clinician' } } });
  });
  await page.goto(`/?auth_action=invite#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('alert')).toHaveText('Unable to check your account right now. Retry your account link when your connection is restored.');
  await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup')) || 'null')).toEqual({ kind: 'invite', userId, sessionId });
  expect(apiRequests).not.toContain('/auth/otp/status');
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Retry account link' }).click();
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
  expect(checks).toBe(2);
});

for (const kind of ['signup', 'invite']) {
  test(`a denied account check cannot acknowledge ${kind} or open password setup`, async ({ page }) => {
    await mockCallbackServices(page);
    await page.route('**/localhost:4000/auth/profile', route => route.fulfill({ status: 403, json: { error: 'Account is disabled.', code: 'ACCOUNT_DISABLED' } }));
    await page.goto(`/?auth_action=${kind}#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Your account has been suspended');
    await expect(page.getByRole('alert').getByRole('link', { name: 'luckypinga077@gmail.com' })).toHaveAttribute('href', 'mailto:luckypinga077@gmail.com');
    await expect(page.getByText('Your email is confirmed.', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update Password' })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).toBeNull();
  });
}

test('stored setup for the same user cannot apply to another authentication session', async ({ page }) => {
  await mockCallbackServices(page);
  await page.goto(`/#${callbackFragment('invite')}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
  await page.evaluate(({ userId }) => sessionStorage.setItem('sccpms:password-setup', JSON.stringify({ kind: 'invite', userId, sessionId: '00000000-0000-4000-8000-000000000099' })), { userId });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Password' })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup'))).toBeNull();
});

test('password creation waits for the trusted account response', async ({ page }) => {
  await mockCallbackServices(page);
  let release!: () => void;
  const accountCheck = new Promise<void>(resolve => { release = resolve; });
  let checking = false;
  await page.route('**/localhost:4000/auth/profile', async route => {
    checking = true;
    await accountCheck;
    await route.fulfill({ json: { data: { id: userId, role: 'doctor', email: 'doctor@spu.ac.za' } } });
  });
  await page.goto(`/?auth_action=invite#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => checking).toBe(true);
  await expect(page.getByRole('heading', { name: 'Set your password' })).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
});

test('a failed password update keeps invitation setup available after reload', async ({ page }) => {
  await mockCallbackServices(page);
  let failUpdate = true;
  await page.route('**/auth/invitation/complete', route => {
    if (failUpdate) return route.fulfill({ status: 422, json: { error: 'Password update temporarily unavailable.' } });
    return route.fulfill({ json: { ...user, email: 'doctor@spu.ac.za' } });
  });
  await page.goto(`/?auth_action=invite#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('New Password', { exact: true }).fill('new-clinic-password');
  await page.getByLabel('Confirm Password', { exact: true }).fill('new-clinic-password');
  await page.getByRole('button', { name: 'Update Password' }).click();
  await expect(page.getByRole('alert')).toHaveText('Password update temporarily unavailable.');
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('sccpms:password-setup')) || 'null')).toEqual({ kind: 'invite', userId, sessionId });
  failUpdate = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeEnabled();
  await page.getByLabel('New Password', { exact: true }).fill('new-clinic-password');
  await page.getByLabel('Confirm Password', { exact: true }).fill('new-clinic-password');
  await page.getByRole('button', { name: 'Update Password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
});

test('an old callback account rejection cannot sign out a newer login', async ({ page }) => {
  await mockCallbackServices(page);
  const nextId = '00000000-0000-4000-8000-000000000031';
  const nextSessionId = '00000000-0000-4000-8000-000000000032';
  const nextUser = { ...user, id: nextId, email: 'newdoctor@spu.ac.za' };
  const nextPayload = Buffer.from(JSON.stringify({ sub: nextId, session_id: nextSessionId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
  const nextToken = `e30.${nextPayload}.test`;
  let release!: () => void;
  const staleCheck = new Promise<void>(resolve => { release = resolve; });
  let checking = false;
  let logouts = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/auth/v1/logout')) logouts += 1; });
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { access_token: nextToken, refresh_token: 'next-refresh', token_type: 'bearer', expires_in: 3600, user: nextUser } }));
  await page.route('**/localhost:4000/auth/profile', async route => {
    if (route.request().headers().authorization === `Bearer ${accessToken}`) {
      checking = true;
      await staleCheck;
      return route.fulfill({ status: 403, json: { error: 'Previous account disabled.', code: 'ACCOUNT_DISABLED' } });
    }
    return route.fulfill({ json: { data: { id: nextId, role: 'doctor', email: nextUser.email, full_name: 'Next Doctor' } } });
  });
  await page.route('**/localhost:4000/auth/otp/send', route => route.fulfill({ status: 202, json: { message: 'A verification code was sent to your account email.', deliveryMode: 'email', destination: 'ne***@spu.ac.za', expiresInSeconds: 300 } }));
  await page.goto(`/?auth_action=invite#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => checking).toBe(true);
  await page.getByRole('button', { name: /^Doctor Medical/ }).click();
  await page.getByLabel('Email Address').fill(nextUser.email);
  await page.getByLabel('Password', { exact: true }).fill('next-clinic-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByText('Enter the 6-digit code sent to your email (ne***@spu.ac.za).')).toBeVisible();
  const rejected = page.waitForResponse(response => response.url().endsWith('/auth/profile') && response.status() === 403);
  release();
  await (await rejected).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  expect(logouts).toBe(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByText('Request a 6-digit verification code for your account email (ne***@spu.ac.za).')).toBeVisible();
});

test('a signup account-check outage gives an existing-password recovery path without claiming confirmation', async ({ page }) => {
  await mockCallbackServices(page, { role: 'patient' });
  await page.route('**/localhost:4000/auth/profile', route => route.fulfill({ status: 503, json: { error: 'Account service temporarily unavailable.' } }));
  await page.goto(`/?auth_action=signup#${callbackFragment()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Unable to finish checking your account right now. Try signing in with your existing password when your connection is restored.');
  await expect(page.getByText('Your email is confirmed.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update Password' })).toHaveCount(0);
});
