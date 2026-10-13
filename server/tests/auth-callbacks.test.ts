import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response as ExpressResponse, Router } from 'express';
import { readFile } from 'node:fs/promises';
import auth from '../src/auth.routes.js';
import api from '../src/api.routes.js';
import { authCallbackUrl } from '../src/auth-callback.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

afterEach(() => mock.restoreAll());

const userId = '23163a42-744a-432c-9dc2-85e88d6c303b';
const adminId = '447d6497-bc49-49c2-b209-25343d33744d';

async function call(router: Router, path: string, body: unknown) {
  const route = router.stack.find((item: any) => item.route?.path === path && item.route?.methods.post);
  assert.ok(route);
  const result = { status: 200, body: undefined as any };
  const res = {
    status(code: number) { result.status = code; return res; },
    json(value: unknown) { result.body = value; return res; },
  };
  await route.route.stack.at(-1).handle({ body, auth: { userId: adminId, role: 'admin' } } as unknown as Request, res as unknown as ExpressResponse, () => {});
  return result;
}

function mockProvider() {
  const requests: Array<{ url: URL; method: string; body: any }> = [];
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  mock.method(pool, 'query', async (sql: string, parameters: unknown[]) => {
    statements.push({ sql, parameters });
    return { rowCount: 1, rows: [] };
  });
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method, body });
    if (url.pathname.endsWith('/auth/v1/signup') || url.pathname.endsWith('/auth/v1/invite')) {
      return Response.json({ user: { id: userId, email: body.email, identities: [{ id: 'callback-fixture-identity', provider: 'email' }] } });
    }
    if (url.pathname.endsWith('/rest/v1/profiles') && ['POST', 'PATCH'].includes(method)) return new Response(null, { status: 204 });
    if (url.pathname.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'PUT') {
      return Response.json({ user: { id: userId, app_metadata: body.app_metadata } });
    }
    throw new Error('External request blocked by auth callback fixture');
  });
  return { requests, statements };
}

test('auth callbacks distinguish signup, invitation and recovery at the configured frontend origin', () => {
  for (const origin of ['http://localhost:5173', 'https://clinic.example']) {
    for (const action of ['signup', 'invite', 'recovery'] as const) {
      assert.equal(authCallbackUrl(action, origin), `${origin}/?auth_action=${action}`);
    }
  }
});

test('signup passes its confirmation callback through the actual Supabase HTTP redirect_to parameter', async () => {
  const provider = mockProvider();
  const result = await call(auth, '/register', {
    email: 'callback123@spu.ac.za', password: 'callback-fixture-password', fullName: 'Signup Callback Fixture',
    phone: '+27123456789', userType: 'Student', studentNumber: 'CALLBACK123',
    department: 'EMS', program: 'Bachelor of Commerce (BCom) in Accounting', addressLine1: '12 Callback Test Street',
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const request = provider.requests.find(request => request.url.pathname.endsWith('/auth/v1/signup'));
  assert.ok(request);
  assert.equal(request.method, 'POST');
  assert.equal(request.url.searchParams.get('redirect_to'), `${config.FRONTEND_ORIGIN}/?auth_action=signup`);
  assert.equal(request.body.email, 'callback123@spu.ac.za');
  assert.equal(request.body.data.role, 'patient');
});

for (const role of ['doctor', 'receptionist'] as const) {
  test(`${role} invitation carries the setup callback and leaves password selection to the invited user`, async () => {
    const provider = mockProvider();
    const result = await call(api, '/staff', {
      email: `${role}@spu.ac.za`, role, fullName: `${role} Callback Fixture`, phone: '+27123456789',
      ...(role === 'doctor' ? { specialty: 'General Medicine' } : {}),
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const request = provider.requests.find(request => request.url.pathname.endsWith('/auth/v1/invite'));
    assert.ok(request);
    assert.equal(request.method, 'POST');
    assert.equal(request.url.searchParams.get('redirect_to'), `${config.FRONTEND_ORIGIN}/?auth_action=invite`);
    assert.equal(request.body.email, `${role}@spu.ac.za`);
    for (const providerRequest of provider.requests) assert.equal(Object.prototype.hasOwnProperty.call(providerRequest.body ?? {}, 'password'), false);
    const claims = provider.requests.find(request => request.url.pathname.endsWith(`/auth/v1/admin/users/${userId}`));
    assert.equal(claims?.body.app_metadata.clinic_role, role);
    assert.equal(provider.statements.some(statement => statement.sql.includes('INSERT INTO clinic_doctors')), role === 'doctor');
  });
}

test('admin-created patient invitations use the same password setup callback', async () => {
  const provider = mockProvider();
  const result = await call(api, '/patients', {
    email: 'invited123@spu.ac.za', fullName: 'Patient Invitation Fixture', phone: '+27123456789',
    userType: 'Student', studentNumber: 'INVITED123',
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const request = provider.requests.find(request => request.url.pathname.endsWith('/auth/v1/invite'));
  assert.ok(request);
  assert.equal(request.url.searchParams.get('redirect_to'), `${config.FRONTEND_ORIGIN}/?auth_action=invite`);
  assert.equal(request.body.email, 'invited123@spu.ac.za');
  assert.equal('password' in request.body, false);
});

test('administrators cannot supply a password while inviting staff', async () => {
  const provider = mockProvider();
  const result = await call(api, '/staff', { email: 'doctor@spu.ac.za', role: 'doctor', fullName: 'Invitation Fixture', phone: '+27123456789', specialty: 'General Medicine', password: 'administrator-selected-password' });
  assert.equal(result.status, 400);
  assert.equal(provider.requests.length, 0);
  assert.equal(provider.statements.length, 0);
});

test('local Supabase settings allow the explicit development callbacks on port 5173', async () => {
  const settings = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(settings, /\[auth\]\s+site_url\s*=\s*"http:\/\/localhost:5173"/);
  for (const host of ['localhost', '127.0.0.1']) {
    for (const action of ['signup', 'invite', 'recovery']) assert.ok(settings.includes(`"http://${host}:5173/?auth_action=${action}"`));
  }
});
