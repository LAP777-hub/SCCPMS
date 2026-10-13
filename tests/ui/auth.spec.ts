import { test, expect, type Page } from '@playwright/test';

const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const settings = { timezone: 'Africa/Johannesburg', opens_at: '08:00:00', closes_at: '17:00:00', default_appointment_minutes: 30, minimum_reschedule_notice_hours: 2 };

async function fillStudentAcademicAddress(page: Page) {
  await page.getByLabel('Department', { exact: true }).selectOption('EMS');
  await page.getByRole('combobox', { name: 'Programme', exact: true }).fill('Accounting');
  await page.getByRole('option', { name: 'Bachelor of Commerce (BCom) in Accounting', exact: true }).click();
  await page.getByRole('combobox', { name: 'Residential Address', exact: true }).fill('10 Long Street, Kimberley');
}

async function mockServices(page: Page, role: string, deliveryFails = false, phone: string | null = '+27123456789') {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://images.pexels.com/**', route => route.abort());
  let verified = false;
  const email = role === 'admin' ? 'admin@gmail.com' : `${role}@spu.ac.za`;
  const destination = `${email.slice(0, 2)}***${email.slice(email.lastIndexOf('@'))}`;
  const profile = { id, role, email, full_name: 'Browser Test', phone, user_type: role === 'patient' ? 'Student' : null };
  const user = { id, email: profile.email, aud: 'authenticated', role: 'authenticated', app_metadata: { clinic_role: role }, user_metadata: {}, created_at: new Date().toISOString() };
  const payload = Buffer.from(JSON.stringify({ sub: id, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ json: path.endsWith('/user') ? user : { access_token: `e30.${payload}.test`, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
  });
  await page.route('**/localhost:4000/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/profile') { await new Promise(resolve => setTimeout(resolve, 100)); return route.fulfill({ json: { data: profile } }); }
    if (path === '/auth/otp/send') return route.fulfill({ status: deliveryFails ? 502 : 202, json: deliveryFails ? { error: 'Email delivery unavailable. Retry later.' } : { message: 'A verification code was sent to your account email.', deliveryMode: 'email', destination, expiresInSeconds: 300 } });
    if (path === '/auth/otp/status') return route.fulfill({ json: { verified } });
    if (path === '/auth/otp/verify') { verified = true; return route.fulfill({ json: { message: 'Verified' } }); }
    if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Polling fallback in browser tests' } });
    if (path === '/api/clinic/settings') return route.fulfill({ json: { data: settings } });
    if (path === '/api/analytics') return route.fulfill({ json: { data: { patients:0,doctors:0,staff:0,appointmentsToday:0,pendingAppointments:0,activeWalkIns:0,clinicalVisits:0,pendingLeaveRequests:0,dailyAppointments:[] } } });
    return route.fulfill({ json: { data: [] } });
  });
}

async function signIn(page: Page, selected: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: new RegExp(`^${selected} `, 'i') }).click();
  await page.getByLabel('Email Address').fill('account@spu.ac.za');
  await page.getByLabel('Password', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

for (const role of ['admin', 'doctor', 'patient', 'receptionist']) {
  test(`${role} must verify OTP before its real dashboard opens and survives reload`, async ({ page }) => {
    await mockServices(page, role);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await signIn(page, role);
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
    await expect(page.locator('.admin-shell,.patient-shell,.reception-shell')).toHaveCount(0);
    await page.getByLabel('6-Digit Code').fill('123456');
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
    await expect(page.locator('img[src*="dashboards"]')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('incorrect role leaves an actionable error on the login form', async ({ page }) => {
  await mockServices(page, 'admin');
  await signIn(page, 'doctor');
  await expect(page.getByText('This account is registered as a admin, not as a doctor.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Doctor Medical/ })).toHaveClass(/selected/);
});

test('failed email delivery preserves the retry verification screen', async ({ page }) => {
  await mockServices(page, 'admin', true);
  await signIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
  await expect(page.getByText('Email delivery unavailable. Retry later.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend code' })).toBeVisible();
});

for (const role of ['admin', 'doctor', 'patient', 'receptionist']) {
  test(`${role} signs in with an email code without a phone number on file`, async ({ page }) => {
    await mockServices(page, role, false, null);
    const sends: { body: string | null }[] = [];
    const mailbox = role === 'admin' ? 'ad***@gmail.com' : `${role.slice(0, 2)}***@spu.ac.za`;
    await page.route('**/localhost:4000/auth/otp/send', route => {
      sends.push({ body: route.request().postData() });
      return route.fulfill({ status: 202, json: { message: 'A verification code was sent to your account email.', deliveryMode: 'email', destination: mailbox, expiresInSeconds: 300 } });
    });
    await signIn(page, role);
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();
    await expect(page.getByText(`Enter the 6-digit code sent to your email (${mailbox}).`)).toBeVisible();
    await expect(page.getByText('The latest code expires after five minutes. Check your inbox and spam folder.')).toBeVisible();
    expect(sends).toEqual([{ body: null }]);
    await page.getByLabel('6-Digit Code').fill('123456');
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
  });
}

test('an older restoration result cannot undo successful email verification', async ({ page }) => {
  await mockServices(page, 'admin');
  await signIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toBeVisible();

  let releaseStatus!: () => void;
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  let statusStarted!: () => void;
  const started = new Promise<void>(resolve => { statusStarted = resolve; });
  let statusFinished!: () => void;
  const finished = new Promise<void>(resolve => { statusFinished = resolve; });
  await page.route('**/localhost:4000/auth/otp/status', async route => {
    statusStarted();
    await statusGate;
    await route.fulfill({ json: { verified: false } });
    statusFinished();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await started;
  await page.getByLabel('6-Digit Code').fill('123456');
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.locator('.admin-shell')).toBeVisible();
  const statusResponse = page.waitForResponse(response => response.url().endsWith('/auth/otp/status'));
  releaseStatus();
  await statusResponse;
  await finished;
  await expect(page.getByRole('heading', { name: 'Verify Your Identity' })).toHaveCount(0);
  await expect(page.locator('.admin-shell')).toBeVisible();
});

test('self registration sends university details to the actual registration route', async ({ page }) => {
  await mockServices(page, 'patient');
  let submitted: Record<string, unknown> | null = null;
  await page.route('**/localhost:4000/auth/register', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { message: 'Check your email to confirm your account before signing in.' } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create one now' }).click();
  await page.getByLabel('Full name').fill('Registration Test');
  await page.getByLabel('University email').fill('test123@spu.ac.za');
  await page.getByLabel('Phone (international format)').fill('+27123456789');
  await page.getByLabel('Student number').fill('TEST123');
  await fillStudentAcademicAddress(page);
  await page.getByLabel('Password (at least 10 characters)').fill('testing-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Check your email to confirm your account before signing in.')).toBeVisible();
  expect(submitted).toMatchObject({ fullName: 'Registration Test', userType: 'Student', studentNumber: 'TEST123', department: 'EMS', program: 'Bachelor of Commerce (BCom) in Accounting', addressLine1: '10 Long Street, Kimberley', addressSource: 'manual' });
  expect(submitted).not.toHaveProperty('role');
});

test('wrong OTP keeps the verification form available for another attempt', async ({ page }) => {
  await mockServices(page,'admin');
  await page.route('**/localhost:4000/auth/otp/verify', route=>route.fulfill({status:401,json:{error:'The verification code is incorrect.'}}));
  await signIn(page,'admin');
  await page.getByLabel('6-Digit Code').fill('111111');
  await page.getByRole('button',{name:'Verify & Sign In'}).click();
  await expect(page.getByText('The verification code is incorrect.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Verify Your Identity'})).toBeVisible();
});

test('empty admin analytics are zero and incoming changes refresh database totals', async ({ page }) => {
  await mockServices(page,'admin');
  let patients=0;
  await page.route('**/localhost:4000/api/analytics',route=>route.fulfill({json:{data:{patients,doctors:0,staff:0,appointmentsToday:0,pendingLeaveRequests:0,dailyAppointments:[]}}}));
  await signIn(page,'admin');await page.getByLabel('6-Digit Code').fill('123456');await page.getByRole('button',{name:'Verify & Sign In'}).click();
  const patientStat=page.locator('.admin-stat-card').filter({hasText:'Active patients'});
  await expect(patientStat.locator('strong')).toHaveText('0');
  await expect(page.getByText('No appointment activity yet.')).toBeVisible();
  patients=4;
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('clinic:data-changed',{detail:{table:'profiles',remote:true}})));
  await expect(patientStat.locator('strong')).toHaveText('4');
});

test('receptionist schedule creates a real API slot in the clinic timezone', async ({ page }) => {
  await mockServices(page,'receptionist');
  await page.route('**/localhost:4000/api/doctors',route=>route.fulfill({json:{data:[{id,full_name:'Registered Doctor',specialty:'General Medicine',department:null}]}}));
  let submitted:Record<string,unknown>|null=null;
  await page.route('**/localhost:4000/api/availability-slots',route=>{
    if(route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({status:201,json:{data:{id}}});}
    return route.fulfill({json:{data:[]}});
  });
  await signIn(page,'receptionist');await page.getByLabel('6-Digit Code').fill('123456');await page.getByRole('button',{name:'Verify & Sign In'}).click();
  await page.getByRole('button',{name:'Doctor Schedules',exact:true}).click();
  await page.getByRole('combobox',{name:'Doctor',exact:true}).selectOption(id);
  await page.getByLabel('Schedule date').fill('2030-01-15');await page.getByLabel('Start time').fill('08:00');
  await page.getByRole('button',{name:'Add availability'}).click();
  await expect.poll(()=>submitted).toMatchObject({doctorId:id,startsAt:'2030-01-15T06:00:00.000Z',endsAt:'2030-01-15T06:30:00.000Z'});
  await expect(page.getByRole('button',{name:'Doctors & Staff',exact:true})).toHaveCount(0);
});

test('self registration blocks personal email before submitting to the server', async ({ page }) => {
  await mockServices(page,'patient');
  let submissions=0;
  await page.route('**/localhost:4000/auth/register',route=>{submissions++;return route.fulfill({json:{message:'Unexpected submission'}});});
  await page.goto('/');await page.getByRole('button',{name:'Create one now'}).click();
  await page.getByLabel('Full name').fill('University Student');await page.getByLabel('University email').fill('student@gmail.com');
  await page.getByLabel('Phone (international format)').fill('+27123456789');await page.getByLabel('Student number').fill('2014000001');
  await fillStudentAcademicAddress(page);
  await page.getByLabel('Password (at least 10 characters)').fill('testing-password');await page.getByLabel('Confirm password', { exact: true }).fill('testing-password');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Use your official @spu.ac.za university email.');expect(submissions).toBe(0);
});
