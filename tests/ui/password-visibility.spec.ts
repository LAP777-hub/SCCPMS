import { Buffer } from 'node:buffer';
import { expect, test, type Locator, type Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000041';
const sessionId = '00000000-0000-4000-8000-000000000042';
const registrationPassword = '  Campus secret 123!  ';
const setupPassword = '  Own new password 123!  ';

async function mockServices(page: Page, role = 'patient') {
  const state = {
    registrations: [] as Record<string, unknown>[],
    passwordUpdates: [] as Record<string, unknown>[],
    signIns: [] as Record<string, unknown>[],
    registrationGate: undefined as Promise<void> | undefined,
    passwordUpdateGate: undefined as Promise<void> | undefined,
    signInGate: undefined as Promise<void> | undefined,
  };
  const user = {
    id: userId, email: `${role}-visibility@example.invalid`, aud: 'authenticated', role: 'authenticated',
    app_metadata: { clinic_role: role }, user_metadata: {},
    created_at: '2026-10-13T00:00:00Z', email_confirmed_at: '2026-10-13T00:00:00Z',
  };
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const accessToken = `e30.${payload}.fixture-signature`;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
      if (path.endsWith('/user')) {
        if (request.method() === 'PUT') {
          state.passwordUpdates.push(request.postDataJSON());
          await state.passwordUpdateGate;
        }
        return route.fulfill({ json: user });
      }
      if (path.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
        state.signIns.push(request.postDataJSON());
        await state.signInGate;
      }
      return route.fulfill({ json: { access_token: accessToken, refresh_token: 'visibility-fixture-refresh', expires_in: 3600, token_type: 'bearer', user } });
    }
    if (path === '/auth/register') {
      state.registrations.push(request.postDataJSON());
      await state.registrationGate;
      return route.fulfill({ status: 201, json: { message: 'Check your email to confirm your account before signing in.' } });
    }
    if (path === '/auth/invitation/complete') { state.passwordUpdates.push(request.postDataJSON()); await state.passwordUpdateGate; return route.fulfill({ json: { message: 'Accepted fixture' } }); }
    if (path === '/auth/profile') return route.fulfill({ json: { data: { id: userId, role, email: user.email, full_name: 'Visibility Fixture', phone: null } } });
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified: false } });
    if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { deliveryMode: 'email', destination: 'vi***@example.invalid', message: 'Fixture verification requested.' } });
    if (path === '/registration/addresses') return route.fulfill({ json: { data: [] } });
    if (url.origin === 'http://127.0.0.1:5178') return route.continue();
    return route.abort();
  });
  return { state, accessToken };
}

async function openRegistration(page: Page) {
  const services = await mockServices(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create one now' }).click();
  await page.getByLabel('Full name').fill('Password Visibility Fixture');
  await page.getByLabel('Email address').fill('2014999999@spu.ac.za');
  await page.getByLabel('Phone (international format)').fill('+27123456789');
  await page.getByLabel('Student number').fill('2014999999');
  await page.getByLabel('Department', { exact: true }).selectOption('EMS');
  await page.getByRole('combobox', { name: 'Programme', exact: true }).fill('BCom) in Accounting');
  await page.getByRole('option', { name: 'Bachelor of Commerce (BCom) in Accounting', exact: true }).click();
  await page.getByRole('combobox', { name: 'Residential Address', exact: true }).fill('10 Fixture Street, Kimberley');
  return services;
}

async function expectToggle(button: Locator, inputId: string, pressed: boolean) {
  await expect(button).toHaveAttribute('type', 'button');
  await expect(button).toHaveAttribute('aria-controls', inputId);
  await expect(button).toHaveAttribute('aria-pressed', String(pressed));
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test('registration password eyes act independently without submitting or changing FormData and disable while saving', async ({ page }) => {
  const { state } = await openRegistration(page);
  const password = page.getByLabel('Password (at least 10 characters)', { exact: true });
  const confirmation = page.getByLabel('Confirm password', { exact: true });
  await expect(password).toHaveAccessibleName('Password (at least 10 characters)');
  await expect(confirmation).toHaveAccessibleName('Confirm password');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(confirmation).toHaveAttribute('type', 'password');
  await password.fill(registrationPassword);
  await confirmation.fill(registrationPassword);

  const showPassword = page.getByRole('button', { name: 'Show password', exact: true });
  await expectToggle(showPassword, 'registration-password', false);
  await showPassword.focus();
  await showPassword.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(confirmation).toHaveAttribute('type', 'password');
  await expect(password).toHaveAccessibleName('Password (at least 10 characters)');
  await expect(confirmation).toHaveAccessibleName('Confirm password');
  await expectToggle(page.getByRole('button', { name: 'Hide password', exact: true }), 'registration-password', true);
  const showConfirmation = page.getByRole('button', { name: 'Show confirm password', exact: true });
  await expectToggle(showConfirmation, 'registration-confirmation', false);
  await showConfirmation.press('Space');
  await expect(confirmation).toHaveAttribute('type', 'text');
  await expect(password).toHaveAccessibleName('Password (at least 10 characters)');
  await expect(confirmation).toHaveAccessibleName('Confirm password');
  await expect(password).toHaveValue(registrationPassword);
  await expect(confirmation).toHaveValue(registrationPassword);
  expect(state.registrations).toEqual([]);
  for (const [input, name] of [[password, 'password'], [confirmation, 'confirmation']] as const) {
    await expect(input).toHaveAttribute('name', name);
    await expect(input).toHaveAttribute('autocomplete', 'new-password');
    await expect(input).toHaveAttribute('minlength', '10');
    await expect(input).toHaveAttribute('maxlength', '128');
    await expect(input).toHaveAttribute('required', '');
  }
  expect(await password.evaluate(input => {
    const form = new FormData((input as HTMLInputElement).form!);
    return { password: form.get('password'), confirmation: form.get('confirmation') };
  })).toEqual({ password: registrationPassword, confirmation: registrationPassword });
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(confirmation).toHaveAttribute('type', 'text');
  await expect(password).toHaveAccessibleName('Password (at least 10 characters)');
  await expect(confirmation).toHaveAccessibleName('Confirm password');

  let release!: () => void;
  state.registrationGate = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect.poll(() => state.registrations.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Hide confirm password', exact: true })).toBeDisabled();
    expect(state.registrations[0].password).toBe(registrationPassword);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Check your account' })).toBeVisible();
});

test('revealing registration confirmation keeps the original password mismatch validation', async ({ page }) => {
  const { state } = await openRegistration(page);
  await expect(page.getByLabel('Password (at least 10 characters)', { exact: true })).toHaveAccessibleName('Password (at least 10 characters)');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAccessibleName('Confirm password');
  await page.getByLabel('Password (at least 10 characters)', { exact: true }).fill(registrationPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill('Different valid password');
  await page.getByRole('button', { name: 'Show confirm password', exact: true }).click();
  await expect(page.getByLabel('Password (at least 10 characters)', { exact: true })).toHaveAccessibleName('Password (at least 10 characters)');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAccessibleName('Confirm password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
  expect(state.registrations).toEqual([]);
});

for (const { action, role } of [
  { action: 'invite', role: 'doctor' },
  { action: 'invite', role: 'receptionist' },
  { action: 'recovery', role: 'patient' },
]) {
  test(`${role} ${action} password eyes preserve independent values, accessible controls and the chosen password`, async ({ page }) => {
    const { state, accessToken } = await mockServices(page, role);
    const fragment = new URLSearchParams({ access_token: accessToken, refresh_token: 'visibility-fixture-refresh', expires_in: '3600', token_type: 'bearer' });
    await page.goto(`/?auth_action=${action}#${fragment}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: action === 'invite' ? 'Set your password' : 'Reset your password' })).toBeVisible();
    const password = page.getByLabel('New Password', { exact: true });
    const confirmation = page.getByLabel('Confirm Password', { exact: true });
    await expect(password).toHaveAccessibleName('New Password');
    await expect(confirmation).toHaveAccessibleName('Confirm Password');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(confirmation).toHaveAttribute('type', 'password');
    await password.fill(setupPassword);
    await confirmation.fill(setupPassword);
    const showPassword = page.getByRole('button', { name: 'Show new password', exact: true });
    await expectToggle(showPassword, 'setup-password', false);
    await showPassword.focus();
    await showPassword.press('Enter');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(confirmation).toHaveAttribute('type', 'password');
    await expect(password).toHaveAccessibleName('New Password');
    await expect(confirmation).toHaveAccessibleName('Confirm Password');
    await expectToggle(page.getByRole('button', { name: 'Hide new password', exact: true }), 'setup-password', true);
    const showConfirmation = page.getByRole('button', { name: 'Show confirm password', exact: true });
    await expectToggle(showConfirmation, 'setup-confirmation', false);
    await showConfirmation.press('Space');
    await expect(confirmation).toHaveAttribute('type', 'text');
    await expect(password).toHaveAccessibleName('New Password');
    await expect(confirmation).toHaveAccessibleName('Confirm Password');
    await expect(password).toHaveValue(setupPassword);
    await expect(confirmation).toHaveValue(setupPassword);
    expect(state.passwordUpdates).toEqual([]);
    for (const input of [password, confirmation]) {
      await expect(input).toHaveAttribute('autocomplete', 'new-password');
      await expect(input).toHaveAttribute('minlength', '12');
      await expect(input).toHaveAttribute('maxlength', '128');
      await expect(input).toHaveAttribute('required', '');
    }
    await page.getByRole('button', { name: 'Hide new password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(confirmation).toHaveAttribute('type', 'text');
    await expect(password).toHaveAccessibleName('New Password');
    await expect(confirmation).toHaveAccessibleName('Confirm Password');
    let release!: () => void;
    state.passwordUpdateGate = new Promise<void>(resolve => { release = resolve; });
    try {
      await page.getByRole('button', { name: 'Update Password', exact: true }).click();
      await expect.poll(() => state.passwordUpdates.length).toBe(1);
      await expect(page.getByRole('button', { name: 'Show new password', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Hide confirm password', exact: true })).toBeDisabled();
      expect(state.passwordUpdates[0].password).toBe(setupPassword);
    } finally { release(); }
    await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
  });
}

test('login uses the same keyboard-accessible password toggle without submitting and disables it while signing in', async ({ page }) => {
  const { state } = await mockServices(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email Address').fill('patient-visibility@example.invalid');
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAccessibleName('Password');
  await password.fill('Visibility login fixture');
  await expect(password).toHaveAttribute('type', 'password');
  const show = page.getByRole('button', { name: 'Show password', exact: true });
  await expectToggle(show, 'login-password', false);
  await show.focus();
  await show.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveAccessibleName('Password');
  await expect(password).toHaveValue('Visibility login fixture');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expectToggle(page.getByRole('button', { name: 'Hide password', exact: true }), 'login-password', true);
  expect(state.signIns).toEqual([]);
  let release!: () => void;
  state.signInGate = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect.poll(() => state.signIns.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Hide password', exact: true })).toBeDisabled();
    expect(state.signIns[0].password).toBe('Visibility login fixture');
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
});
