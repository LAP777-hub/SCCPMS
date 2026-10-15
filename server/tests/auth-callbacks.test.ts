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

function mockProvider(options: { existingEmail?: boolean; invitedId?: string; failAudit?: boolean; failProfile?: boolean } = {}) {
  const requests: Array<{ url: URL; method: string; body: any }> = [];
  const statements: Array<{ sql: string; parameters: unknown[] }> = [];
  const events: string[] = [];
  mock.method(pool, 'query', async (sql: string, parameters: unknown[]) => {
    statements.push({ sql, parameters });
    if (sql.includes('INSERT INTO clinic_doctors')) events.push('doctor-unpublished');
    if (sql.includes('INSERT INTO account_invitations')) events.push('tracking');
    if (sql.includes('INSERT INTO audit_events')) {
      if (options.failAudit) throw new Error('Private audit fixture failure');
      events.push('audit');
    }
    if (sql.includes('UPDATE clinic_doctors SET active=true')) events.push('publish');
    return { rowCount: 1, rows: [] };
  });
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method, body });
    if (url.pathname.endsWith('/auth/v1/admin/users') && method === 'POST') {
      events.push('create');
      if (options.existingEmail) return Response.json({ code: 'email_exists', message: 'Email belongs to an unconfirmed fixture account' }, { status: 422, headers: { 'X-Supabase-Api-Version': '2024-01-01' } });
      return Response.json({ id: userId, email: body.email, app_metadata: body.app_metadata });
    }
    if (url.pathname.endsWith('/auth/v1/signup') || url.pathname.endsWith('/auth/v1/invite')) {
      events.push(url.pathname.endsWith('/invite') ? 'invite' : 'signup');
      return Response.json({ user: { id: options.invitedId ?? userId, email: body.email, identities: [{ id: 'callback-fixture-identity', provider: 'email' }] } });
    }
    if (url.pathname.endsWith('/rest/v1/profiles') && ['POST', 'PATCH'].includes(method)) {
      events.push('profile');
      if (options.failProfile) return Response.json({ message: 'Private profile fixture failure' }, { status: 503 });
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'PUT') {
      return Response.json({ user: { id: userId, app_metadata: body.app_metadata } });
    }
    if (url.pathname.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'DELETE') {
      events.push('delete-owned');
      return Response.json({ id: userId });
    }
    throw new Error('External request blocked by auth callback fixture');
  });
  return { requests, statements, events };
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
    const claims = provider.requests.find(request => request.url.pathname.endsWith('/auth/v1/admin/users') && request.method === 'POST');
    assert.equal(claims?.body.app_metadata.clinic_role, role);
    assert.equal(claims?.body.email_confirm, false);
    assert.ok(provider.events.indexOf('create') < provider.events.indexOf('profile'));
    assert.ok(provider.events.indexOf('profile') < provider.events.indexOf('invite'));
    assert.ok(provider.events.indexOf('invite') < provider.events.indexOf('tracking'));
    assert.equal(provider.statements.some(statement => statement.sql.includes('INSERT INTO clinic_doctors')), role === 'doctor');
    if (role === 'doctor') {
      assert.match(provider.statements.find(statement => statement.sql.includes('INSERT INTO clinic_doctors'))!.sql, /VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*false\)/);
      for (const step of ['doctor-unpublished', 'invite', 'tracking', 'audit']) assert.ok(provider.events.indexOf(step) < provider.events.indexOf('publish'), step);
    }
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
  const created = provider.requests.find(request => request.url.pathname.endsWith('/auth/v1/admin/users') && request.method === 'POST')!;
  assert.equal(created.body.email_confirm, false);
  assert.equal(created.body.app_metadata.clinic_role, 'patient');
  assert.ok(provider.events.indexOf('create') < provider.events.indexOf('profile'));
  assert.ok(provider.events.indexOf('profile') < provider.events.indexOf('invite'));
  assert.ok(provider.events.indexOf('invite') < provider.events.indexOf('tracking'));
});

const invitationCases = [
  { role: 'doctor', path: '/staff', body: { email: 'doctor@spu.ac.za', role: 'doctor', fullName: 'Doctor Invitation Fixture', phone: '+27123456789', specialty: 'Family Medicine' } },
  { role: 'receptionist', path: '/staff', body: { email: 'receptionist@spu.ac.za', role: 'receptionist', fullName: 'Receptionist Invitation Fixture', phone: '+27123456789' } },
  { role: 'patient', path: '/patients', body: { email: 'invited123@spu.ac.za', fullName: 'Patient Invitation Fixture', phone: '+27123456789', userType: 'Student', studentNumber: 'INVITED123' } },
];

for (const invitation of invitationCases) {
  test(`${invitation.role} invitation rejects an existing unconfirmed email without overwriting or deleting it`, async () => {
    const provider = mockProvider({ existingEmail: true });
    const result = await call(api, invitation.path, invitation.body);
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'ACCOUNT_EMAIL_IN_USE');
    assert.equal(provider.requests.length, 1, 'only atomic CREATE may be attempted');
    assert.equal(provider.requests[0].method, 'POST');
    assert.equal(provider.requests[0].url.pathname.endsWith('/auth/v1/admin/users'), true);
    assert.equal(provider.statements.length, 0);
  });

  test(`${invitation.role} invitation requires its owned UUID acknowledgement and cleans up only the newly created identity`, async () => {
    const provider = mockProvider({ invitedId: adminId });
    const result = await call(api, invitation.path, invitation.body);
    assert.equal(result.status, 503);
    const deleted = provider.requests.filter(request => request.method === 'DELETE');
    assert.deepEqual(deleted.map(request => request.url.pathname.split('/').at(-1)), [userId]);
    assert.equal(provider.requests.some(request => request.method === 'PUT'), false);
    assert.equal(provider.events.includes('tracking'), false);
    assert.equal(provider.events.includes('publish'), false);
  });
}

test('a doctor stays unpublished when invitation tracking or audit cannot finish', async () => {
  const provider = mockProvider({ failAudit: true });
  const result = await call(api, '/staff', invitationCases[0].body);
  assert.equal(result.status, 503);
  assert.ok(provider.events.includes('doctor-unpublished'));
  assert.ok(provider.events.includes('invite'));
  assert.ok(provider.events.includes('tracking'));
  assert.equal(provider.events.includes('publish'), false);
  assert.deepEqual(provider.requests.filter(request => request.method === 'DELETE').map(request => request.url.pathname.split('/').at(-1)), [userId]);
  assert.ok(provider.statements.some(statement => statement.sql.startsWith('DELETE FROM clinic_doctors') && statement.parameters[0] === userId));
});

test('failed patient provisioning deletes only the fresh account before sending an invitation', async () => {
  const provider = mockProvider({ failProfile: true });
  assert.equal((await call(api, '/patients', invitationCases[2].body)).status, 503);
  assert.equal(provider.events.includes('invite'), false);
  assert.deepEqual(provider.requests.filter(request => request.method === 'DELETE').map(request => request.url.pathname.split('/').at(-1)), [userId]);
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
