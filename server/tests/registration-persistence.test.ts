import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response as ExpressResponse } from 'express';
import auth from '../src/auth.routes.js';
import { pool } from '../src/db.js';

afterEach(() => mock.restoreAll());

const userId = '64b7e2c9-3ea2-4c21-8e6c-28597921b6ae';
const details = {
  fullName: 'Registration Persistence Fixture', email: 'fixture123@spu.ac.za',
  password: 'fixture-password-only', phone: '+27123456789', userType: 'Student',
  studentNumber: 'FIXTURE123', department: 'NAS', program: 'BSc in Data Science',
  addressLine1: '  12 Fixture Street, Kimberley  ', addressLatitude: -28.745,
  addressLongitude: 24.762, addressSource: 'photon',
};

async function register(body: unknown) {
  const route = auth.stack.find((item: any) => item.route?.path === '/register' && item.route?.methods.post);
  assert.ok(route);
  const result = { status: 200, body: undefined as any };
  const res = {
    status(code: number) { result.status = code; return res; },
    json(body: unknown) { result.body = body; return res; },
  };
  await route.route.stack.at(-1).handle({ body } as Request, res as unknown as ExpressResponse, () => {});
  return result;
}

function providerFixture(options: { identities?: unknown[]; omitIdentities?: boolean; failDetails?: boolean } = {}) {
  const requests: Array<{ path: string; method: string; body: any; url: URL; headers: Headers }> = [];
  const savedProfile: Record<string, unknown> = { id: userId, role: 'patient', address_latitude: null, address_longitude: null, address_source: null };
  const audits: unknown[][] = [];
  mock.method(pool, 'query', async (sql: string, parameters: unknown[]) => { audits.push([sql, parameters]); return { rows: [], rowCount: 1 }; });
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path: url.pathname, method, body, url, headers: new Headers(init?.headers) });
    const user = { id: userId, email: details.email, ...(options.omitIdentities ? {} : { identities: options.identities ?? [{ id: 'fixture-identity', provider: 'email' }] }) };
    if (url.pathname.endsWith('/auth/v1/signup')) {
      // Reproduce the existing auth trigger: its row already exists when the
      // ignore-duplicate upsert runs, and does not contain new coordinate fields.
      Object.assign(savedProfile, body.data);
      savedProfile.address_latitude = null;
      savedProfile.address_longitude = null;
      savedProfile.address_source = null;
      return Response.json({ user });
    }
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      if (method === 'PATCH') {
        if (options.failDetails) return Response.json({ message: 'Fixture write rejected' }, { status: 500 });
        Object.assign(savedProfile, body);
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith(`/auth/v1/admin/users/${userId}`)) return Response.json({ user });
    throw new Error('Unexpected external request blocked by registration fixture');
  });
  return { requests, savedProfile, audits };
}

test('registration persists map and exact academic selections even when the signup trigger already created its profile', async () => {
  const fixture = providerFixture();
  const result = await register(details);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(fixture.savedProfile.role, 'patient');
  assert.equal(fixture.savedProfile.department, 'NAS');
  assert.equal(fixture.savedProfile.program, 'BSc in Data Science');
  assert.equal(fixture.savedProfile.address_line1, '12 Fixture Street, Kimberley');
  assert.equal(fixture.savedProfile.address_latitude, -28.745);
  assert.equal(fixture.savedProfile.address_longitude, 24.762);
  assert.equal(fixture.savedProfile.address_source, 'photon');
  const upsert = fixture.requests.find(request => request.path.endsWith('/rest/v1/profiles') && request.method === 'POST');
  assert.ok(upsert?.headers.get('Prefer')?.includes('resolution=ignore-duplicates'));
  const update = fixture.requests.find(request => request.path.endsWith('/rest/v1/profiles') && request.method === 'PATCH');
  assert.ok(update);
  assert.equal(update.url.searchParams.get('id'), `eq.${userId}`);
  assert.equal(update.url.searchParams.get('role'), 'eq.patient');
  for (const field of ['role', 'email', 'student_number', 'staff_number', 'phone']) assert.equal(field in update.body, false, field);
  assert.equal(fixture.audits.length, 1);
});

test('manual registration stores trimmed free-form address with null coordinates and no legacy city requirement', async () => {
  const fixture = providerFixture();
  const result = await register({ ...details, addressLine1: '  Campus residence room A  ', addressLatitude: undefined, addressLongitude: undefined, addressSource: undefined });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(fixture.savedProfile.address_line1, 'Campus residence room A');
  assert.equal(fixture.savedProfile.address_source, 'manual');
  assert.equal(fixture.savedProfile.address_latitude, null);
  assert.equal(fixture.savedProfile.address_longitude, null);
  assert.equal(fixture.savedProfile.city, null);
  assert.equal(fixture.savedProfile.province, null);
  assert.equal(fixture.savedProfile.postal_code, null);
});

for (const omitIdentities of [false, true]) {
  test(`obfuscated or unknown signup identities cannot write existing accounts (${omitIdentities ? 'missing' : 'empty'} identities)`, async () => {
    const fixture = providerFixture({ identities: [], omitIdentities });
    const result = await register(details);
    assert.equal(result.status, 202);
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].path.endsWith('/auth/v1/signup'), true);
    assert.equal(fixture.audits.length, 0);
    assert.equal(result.body.confirmationRequired, true);
  });
}

test('a failed registration-details save removes the newly created account and never grants access', async () => {
  const fixture = providerFixture({ failDetails: true });
  const result = await register(details);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /registration details could not be saved/);
  assert.equal(fixture.requests.filter(request => request.method === 'DELETE').length, 1);
  assert.equal(fixture.requests.filter(request => request.path.includes('/auth/v1/admin/users/') && request.method === 'PUT').length, 0);
  assert.equal(fixture.audits.length, 0);
});
