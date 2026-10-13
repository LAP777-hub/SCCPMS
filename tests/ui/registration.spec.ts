import { test, expect, type Page } from '@playwright/test';

const faculties = [
  { code: 'EMS', programme: 'Bachelor of Commerce (BCom) in Accounting' },
  { code: 'EDU', programme: 'Bachelor of Education (BEd) in Foundation Phase Teaching' },
  { code: 'Humanities', programme: 'BA Honours in Languages (English)' },
  { code: 'NAS', programme: 'BSc in Data Science' },
];
const selectedAddress = {
  id: 'W632356159',
  address: 'Long Street, New Park, Kimberley, Northern Cape, South Africa',
  latitude: -28.7438864,
  longitude: 24.7613275,
  source: 'photon',
};
const successMessage = 'Check your email to confirm your account before signing in.';

async function openRegistration(page: Page, options: { addressUnavailable?: boolean } = {}) {
  const submissions: Record<string, unknown>[] = [];
  const searches: { query: string; authorization?: string }[] = [];
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://images.pexels.com/**', route => route.abort());
  await page.route('**/auth/v1/**', route => route.fulfill({ json: { user: null } }));
  await page.route('**/localhost:4000/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/registration/addresses') {
      searches.push({ query: url.searchParams.get('q') ?? '', authorization: route.request().headers().authorization });
      return route.fulfill(options.addressUnavailable
        ? { status: 503, json: { error: 'Address search is temporarily unavailable.' } }
        : { json: { data: [selectedAddress], attribution: '© OpenStreetMap contributors', provider: 'Photon' } });
    }
    if (url.pathname === '/auth/register') {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { confirmationRequired: true, message: successMessage } });
    }
    return route.fulfill({ status: 503, json: { error: 'Unexpected service request in registration regression.' } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create one now' }).click();
  return { submissions, searches };
}

async function fillIdentity(page: Page) {
  await page.getByLabel('Full name').fill('University Student');
  await page.getByLabel('University email').fill('2014000001@spu.ac.za');
  await page.getByLabel('Phone (international format)').fill('+27123456789');
  await page.getByLabel('Student number').fill('2014000001');
  await page.getByLabel('Password (at least 10 characters)').fill('testing-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('testing-password');
}

async function chooseAcademicDetails(page: Page) {
  await page.getByLabel('Department', { exact: true }).selectOption('EMS');
  await page.getByRole('combobox', { name: 'Programme', exact: true }).fill('Accounting');
  await page.getByRole('option', { name: faculties[0].programme, exact: true }).click();
}

test('student registration requires a residential address without separate location fields', async ({ page }) => {
  const { submissions } = await openRegistration(page);
  await fillIdentity(page);
  await chooseAcademicDetails(page);
  const address = page.getByRole('combobox', { name: 'Residential Address', exact: true });
  await expect(address).toHaveAttribute('required', '');
  for (const label of ['City', 'Province', 'Postal code']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect(await address.evaluate(input => (input as HTMLInputElement).validity.valueMissing)).toBe(true);
  expect(submissions).toHaveLength(0);
});

test('all four faculties show only their matching programmes', async ({ page }) => {
  await openRegistration(page);
  const programme = page.getByRole('combobox', { name: 'Programme', exact: true });
  await expect(programme).toBeDisabled();
  await expect(page.getByLabel('Department', { exact: true }).locator('option[value="NAS"]')).toHaveText('NAS — Natural and Applied Sciences');
  const codes = await page.getByLabel('Department', { exact: true }).locator('option').evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
  expect(codes).toEqual(faculties.map(faculty => faculty.code));
  for (const faculty of faculties) {
    await page.getByLabel('Department', { exact: true }).selectOption(faculty.code);
    await expect(programme).toBeEnabled();
    await programme.click();
    await expect(page.getByRole('option', { name: faculty.programme, exact: true })).toBeVisible();
    for (const other of faculties.filter(item => item.code !== faculty.code)) {
      await expect(page.getByRole('option', { name: other.programme, exact: true })).toHaveCount(0);
    }
    await programme.press('Escape');
  }
});

test('programme search is case insensitive and keyboard selection commits the programme', async ({ page }) => {
  await openRegistration(page);
  await page.getByLabel('Department', { exact: true }).selectOption('EMS');
  const programme = page.getByRole('combobox', { name: 'Programme', exact: true });
  await programme.fill('ACCOUNTING');
  await expect(page.getByRole('option', { name: faculties[0].programme, exact: true })).toBeVisible();
  const results = await page.getByRole('listbox').getByRole('option').allTextContents();
  expect(results.length).toBeGreaterThan(0);
  expect(results.every(result => /accounting/i.test(result))).toBe(true);
  await programme.fill('BCom) in Accounting');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await programme.press('Home');
  await programme.press('Enter');
  await expect(programme).toHaveValue(faculties[0].programme);
  await expect(page.locator('input[name="program"]')).toHaveValue(faculties[0].programme);
  await programme.fill('Programme outside the catalogue');
  await expect(page.getByText('No programmes match your search.', { exact: true })).toBeVisible();
  await expect(page.locator('input[name="program"]')).toHaveValue('');
  expect(await programme.evaluate(input => (input as HTMLInputElement).checkValidity())).toBe(false);
});

test('changing faculty clears the chosen programme and hidden signup value', async ({ page }) => {
  await openRegistration(page);
  await chooseAcademicDetails(page);
  await page.getByLabel('Department', { exact: true }).selectOption('EDU');
  const programme = page.getByRole('combobox', { name: 'Programme', exact: true });
  await expect(programme).toHaveValue('');
  await expect(page.locator('input[name="program"]')).toHaveValue('');
  await programme.click();
  await expect(page.getByRole('option', { name: faculties[1].programme, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: faculties[0].programme, exact: true })).toHaveCount(0);
});

test('selecting a public map result saves its address and coordinates in signup', async ({ page }) => {
  const { submissions, searches } = await openRegistration(page);
  await fillIdentity(page);
  await chooseAcademicDetails(page);
  const address = page.getByRole('combobox', { name: 'Residential Address', exact: true });
  await address.fill('Long Street');
  await page.getByRole('option', { name: selectedAddress.address, exact: true }).click();
  await expect(address).toHaveValue(selectedAddress.address);
  expect(searches).toContainEqual({ query: 'Long Street', authorization: undefined });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(successMessage)).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    department: 'EMS', program: faculties[0].programme, userType: 'Student', studentNumber: '2014000001',
    addressLine1: selectedAddress.address, addressLatitude: selectedAddress.latitude,
    addressLongitude: selectedAddress.longitude, addressSource: 'photon',
  });
  expect(submissions[0]).not.toHaveProperty('role');
});

test('unavailable address search still permits signup with a manual residential address', async ({ page }) => {
  const { submissions } = await openRegistration(page, { addressUnavailable: true });
  await fillIdentity(page);
  await chooseAcademicDetails(page);
  const manualAddress = '25 New Park Road, Kimberley';
  const response = page.waitForResponse(result => new URL(result.url()).pathname === '/registration/addresses' && result.status() === 503);
  await page.getByRole('combobox', { name: 'Residential Address', exact: true }).fill(manualAddress);
  await response;
  await expect(page.getByText('Address search is temporarily unavailable. You can enter your residential address manually.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(successMessage)).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ addressLine1: manualAddress, addressSource: 'manual', department: 'EMS', program: faculties[0].programme });
  expect(submissions[0]).not.toHaveProperty('addressLatitude');
  expect(submissions[0]).not.toHaveProperty('addressLongitude');
});

test('editing a selected map address removes obsolete coordinates before signup', async ({ page }) => {
  const { submissions } = await openRegistration(page);
  await fillIdentity(page);
  await chooseAcademicDetails(page);
  const address = page.getByRole('combobox', { name: 'Residential Address', exact: true });
  await address.fill('Long Street');
  await page.getByRole('option', { name: selectedAddress.address, exact: true }).click();
  await address.fill('26 New Park Road, Kimberley');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(successMessage)).toBeVisible();
  expect(submissions[0]).toMatchObject({ addressLine1: '26 New Park Road, Kimberley', addressSource: 'manual' });
  expect(submissions[0]).not.toHaveProperty('addressLatitude');
  expect(submissions[0]).not.toHaveProperty('addressLongitude');
});

test('address suggestions support keyboard selection without prematurely submitting signup', async ({ page }) => {
  const { submissions } = await openRegistration(page);
  await fillIdentity(page);
  await chooseAcademicDetails(page);
  const address = page.getByRole('combobox', { name: 'Residential Address', exact: true });
  await address.fill('Long Street');
  await expect(page.getByRole('option', { name: selectedAddress.address, exact: true })).toBeVisible();
  await address.press('ArrowDown');
  await address.press('Enter');
  await expect(address).toHaveValue(selectedAddress.address);
  await expect(page.getByRole('option', { name: selectedAddress.address, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View selected location', exact: true })).toHaveAttribute('href',
    `https://www.openstreetmap.org/?mlat=${selectedAddress.latitude}&mlon=${selectedAddress.longitude}#map=17/${selectedAddress.latitude}/${selectedAddress.longitude}`);
  expect(submissions).toHaveLength(0);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(successMessage)).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ addressLine1: selectedAddress.address,
    addressLatitude: selectedAddress.latitude, addressLongitude: selectedAddress.longitude, addressSource: 'photon' });
});

test('an older lookup cannot replace the latest residential address results', async ({ page }) => {
  await openRegistration(page);
  let releaseOlder!: () => void;
  const olderGate = new Promise<void>(resolve => { releaseOlder = resolve; });
  let olderStarted!: () => void;
  const started = new Promise<void>(resolve => { olderStarted = resolve; });
  let olderHandled!: () => void;
  const handled = new Promise<void>(resolve => { olderHandled = resolve; });
  let olderSettled!: () => void;
  const settled = new Promise<void>(resolve => { olderSettled = resolve; });
  const settleLookup = (request: { url: () => string }) => {
    const url = new URL(request.url());
    if (url.pathname === '/registration/addresses' && url.searchParams.get('q') === 'Long Street') olderSettled();
  };
  page.on('requestfinished', settleLookup);
  page.on('requestfailed', settleLookup);
  await page.route('**/localhost:4000/registration/addresses?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === 'Long Street') {
      olderStarted();
      await olderGate;
      // An aborted previous lookup may already be closed when its mock is released.
      await route.fulfill({ json: { data: [selectedAddress], attribution: '© OpenStreetMap contributors', provider: 'Photon' } }).catch(() => undefined);
      olderHandled();
    } else {
      await route.fulfill({ json: { data: [], attribution: '© OpenStreetMap contributors', provider: 'Photon' } });
    }
  });
  try {
    const address = page.getByRole('combobox', { name: 'Residential Address', exact: true });
    await address.fill('Long Street');
    await started;
    await address.fill('New Park');
    await expect(page.getByText('No matching map address found. Keep your manually entered residential address.', { exact: true })).toBeVisible();
    releaseOlder();
    await handled;
    await settled;
    // Let a completed response and its React update reach the next browser frame.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(address).toHaveValue('New Park');
    await expect(page.getByRole('option', { name: selectedAddress.address, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View selected location', exact: true })).toHaveCount(0);
  } finally {
    releaseOlder();
  }
});
