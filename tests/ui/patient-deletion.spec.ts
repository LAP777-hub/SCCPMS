import { test, expect, type Page } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000003';

async function openPatients(page: Page, options: { role?: 'admin' | 'receptionist'; active?: boolean; failFirstDelete?: boolean; pending?: boolean; failRefreshAfterDelete?: boolean } = {}) {
  const role = options.role ?? 'admin';
  const patient = {
    id: patientId, email: '2026123456@spu.ac.za', full_name: 'Fixture Patient',
    phone: '+27712345678', user_type: 'Student', student_number: '2026123456',
    department: 'NAS', program: 'BSc in Data Science', active: options.active ?? false,
    deletion_requested_at: options.pending ? '2026-10-13T08:00:00Z' : null,
    deleted_at: null, created_at: '2026-10-13T00:00:00Z',
  };
  let patients = [patient];
  let verified = false;
  let attempts = 0;
  const writes: { method: string; body?: unknown }[] = [];
  const user = { id: userId, email: `${role}@spu.ac.za`, aud: 'authenticated', role: 'authenticated', app_metadata: { clinic_role: role }, user_metadata: {}, email_confirmed_at: '2026-10-13T00:00:00Z', created_at: '2026-10-13T00:00:00Z' };
  const claims = Buffer.from(JSON.stringify({ sub: userId, session_id: '00000000-0000-4000-8000-000000000002', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url');
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
      return route.fulfill({ json: path.endsWith('/user') ? user : { access_token: `e30.${claims}.fixture`, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user } });
    }
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      if (path === '/auth/profile') return route.fulfill({ json: { data: { ...user, role, full_name: 'Administrator Fixture' } } });
      if (path === '/auth/otp/status') return route.fulfill({ json: { verified } });
      if (path === '/auth/otp/send') return route.fulfill({ status: 202, json: { message: 'Fixture only', deliveryMode: 'email', destination: 'fi***@spu.ac.za' } });
      if (path === '/auth/otp/verify') { verified = true; return route.fulfill({ json: { message: 'Verified fixture' } }); }
      if (path === '/api/events') return route.fulfill({ status: 503, json: { error: 'Fixture polling only' } });
      if (path === `/api/patients/${patientId}`) {
        const method = route.request().method();
        const body = route.request().postData() ? route.request().postDataJSON() : undefined;
        writes.push({ method, body });
        if (method === 'PATCH') Object.assign(patient, body);
        if (method === 'DELETE') {
          attempts += 1;
          if (options.failFirstDelete && attempts === 1) {
            patient.deletion_requested_at = '2026-10-13T08:00:00Z';
            return route.fulfill({ status: 503, json: { error: 'Unable to complete deletion. Retry deletion.', code: 'PATIENT_DELETION_PENDING' } });
          }
          patients = [];
        }
        return route.fulfill({ json: { data: patient } });
      }
      if (path === '/api/patients' && attempts > 0 && options.failRefreshAfterDelete) return route.fulfill({ status: 503, json: { error: 'Patient refresh is temporarily unavailable.' } });
      const data = path === '/api/patients' ? patients : path === '/api/clinic/settings' ? { timezone: 'Africa/Johannesburg' } : path === '/api/analytics' ? { patients: patients.length, doctors: 0, staff: 1, appointmentsToday: 0, pendingAppointments: 0, activeWalkIns: 0, clinicalVisits: 0, pendingLeaveRequests: 0, dailyAppointments: [] } : [];
      return route.fulfill({ json: { data } });
    }
    if (url.origin === 'http://127.0.0.1:5178') return route.continue();
    return route.abort();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: new RegExp(`^${role}`, 'i') }).click();
  await page.getByLabel('Email Address').fill(`${role}@spu.ac.za`);
  await page.getByLabel('Password', { exact: true }).fill('mock-password-only');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByLabel('6-Digit Code').fill('123456');
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await page.locator('aside nav').getByRole('button', { name: role === 'admin' ? 'Patients' : 'Patients & Registration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Patients', level: 1, exact: true })).toBeVisible();
  return { writes, row: page.getByRole('row').filter({ hasText: 'Fixture Patient' }) };
}

test('admin must deactivate before confirming permanent patient account deletion', async ({ page }) => {
  const { writes, row } = await openPatients(page, { active: true });
  await expect(row.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate account', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Delete account', exact: true })).toBeEnabled();
  expect(writes).toEqual([{ method: 'PATCH', body: { active: false } }]);
  await row.getByRole('button', { name: 'Delete account', exact: true }).click();
  const confirmation = page.getByRole('group', { name: 'Delete patient account' });
  await expect(confirmation).toContainText('Fixture Patient');
  await expect(confirmation).toContainText('Medical records, appointment history and audit records will remain accessible');
  expect(writes).toHaveLength(1);
  await confirmation.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Patient login account deleted');
  expect(writes).toEqual([{ method: 'PATCH', body: { active: false } }, { method: 'DELETE', body: undefined }]);
});

test('cancelling patient deletion preserves the inactive account without a DELETE request', async ({ page }) => {
  const { writes, row } = await openPatients(page);
  await row.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('group', { name: 'Delete patient account' }).getByRole('button', { name: 'Keep account' }).click();
  await expect(row.getByRole('button', { name: 'Reactivate', exact: true })).toBeEnabled();
  await expect(page.getByRole('group', { name: 'Delete patient account' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('a failed deletion keeps the account suspended and exposes a working retry', async ({ page }) => {
  const { writes, row } = await openPatients(page, { failFirstDelete: true });
  await row.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('group', { name: 'Delete patient account' }).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(row).toContainText('Deletion pending');
  await expect(row.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Retry deletion');
  await row.getByRole('button', { name: 'Retry deletion', exact: true }).click();
  await page.getByRole('group', { name: 'Finish patient deletion' }).getByRole('button', { name: 'Retry deletion' }).click();
  await expect(row).toHaveCount(0);
  expect(writes.map(write => write.method)).toEqual(['DELETE', 'DELETE']);
});

test('receptionists cannot deactivate, reactivate or delete a patient account', async ({ page }) => {
  const { row, writes } = await openPatients(page, { role: 'receptionist' });
  await expect(row).toBeVisible();
  for (const name of ['Deactivate', 'Reactivate', 'Delete account', 'Retry deletion']) await expect(row.getByRole('button', { name, exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('a pending deletion cannot expose account editing or reactivation', async ({ page }) => {
  const { row, writes } = await openPatients(page, { pending: true });
  await expect(row).toContainText('Deletion pending');
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Retry deletion', exact: true })).toBeEnabled();
  expect(writes).toEqual([]);
});

test('pending deletion blocks reactivation even when the directory refresh fails', async ({ page }) => {
  const { row } = await openPatients(page, { failFirstDelete: true, failRefreshAfterDelete: true });
  await row.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('group', { name: 'Delete patient account' }).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(row).toContainText('Deletion pending');
  await expect(row.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Retry deletion', exact: true })).toBeEnabled();
});

test('confirmed deletion removes the row even when the directory refresh fails', async ({ page }) => {
  const { row, writes } = await openPatients(page, { failRefreshAfterDelete: true });
  await row.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('group', { name: 'Delete patient account' }).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(row).toHaveCount(0);
  expect(writes.map(write => write.method)).toEqual(['DELETE']);
});
