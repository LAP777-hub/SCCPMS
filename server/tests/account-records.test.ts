import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import records from '../src/account-records.routes.js';
import { pool } from '../src/db.js';
import express from 'express';
import { once } from 'node:events';

afterEach(()=>mock.restoreAll());
test('the Records administrator guard does not block other role APIs mounted after this router',async()=>{
  const app=express();
  app.use((req,_res,next)=>{req.auth={userId:'fixture',sessionId:'fixture',role:'doctor',email:'doctor@gmail.com',phone:null,profile:{}};next();});
  app.use(records);app.get('/appointments',(_req,res)=>res.json({allowed:true}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const address=server.address();assert.ok(address&&typeof address!=='string');
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/appointments`)).status,200);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/account-records`)).status,403);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
const response=()=>{const result={status:200,body:undefined as any};const res={status(status:number){result.status=status;return res;},json(body:unknown){result.body=body;return res;}};return{result,res};};
const handler=(path:string)=>records.stack.find((layer:any)=>layer.route?.path===path).route.stack.at(-1).handle;
test('account record routes reject non-administrators before directory access',()=>{
  const guard=records.stack[0].handle;
  for(const role of ['patient','doctor','receptionist']){const {result,res}=response();let next=false;guard({auth:{role}},res,()=>{next=true;});assert.equal(result.status,403);assert.equal(next,false);}
});
test('archive search uses bounded parameters and returns retained contact details',async()=>{
  const data=[{id:'fixture-id',email:'former@gmail.com',phone:'+27712345678',role:'doctor',deleted_at:'2026-10-15T00:00:00Z'}];
  const query=mock.method(pool,'query',async()=>({rows:data,rowCount:1}));
  const {result,res}=response();await handler('/account-records')({query:{q:"' OR true --",role:'doctor'}},res);
  assert.equal(result.status,200);assert.deepEqual(result.body.data,data);
  assert.deepEqual(query.mock.calls[0].arguments[1],["' OR true --",'doctor',250]);
  assert.match(String(query.mock.calls[0].arguments[0]),/a.deleted_at IS NOT NULL/);
});
test('invalid archive filters and reinvitation identity overrides are rejected without provider calls',async()=>{
  const query=mock.method(pool,'query',async()=>{throw new Error('No database reads expected');});
  const fetcher=mock.method(globalThis,'fetch',async()=>{throw new Error('No mail expected');});
  for(const input of [{limit:501},{role:'admin'},{q:'x'.repeat(161)}]){const {result,res}=response();await handler('/account-records')({query:input},res);assert.equal(result.status,400);}
  const {result,res}=response();await handler('/account-records/:id/reinvite')({params:{id:'00000000-0000-4000-8000-000000000092'},body:{email:'other@gmail.com',role:'admin'}},res);assert.equal(result.status,400);
  assert.equal(query.mock.calls.length,0);assert.equal(fetcher.mock.calls.length,0);
});
test('a recorded replacement account prevents repeat invitation emails',async()=>{
  const queries:string[]=[];
  mock.method(pool,'connect',async()=>({release(){},async query(sql:string){queries.push(sql);return{rowCount:1,rows:sql.includes('SELECT p.*')?[{role:'doctor',deleted_at:new Date(),deleted_email:'former@gmail.com'}]:sql.includes('SELECT new_user_id')?[{new_user_id:'existing-replacement'}]:[]};}}));
  const fetcher=mock.method(globalThis,'fetch',async()=>{throw new Error('Repeated invitations must not email again');});
  const {result,res}=response();await handler('/account-records/:id/reinvite')({params:{id:'00000000-0000-4000-8000-000000000092'},body:{},auth:{userId:'admin-fixture'}},res);
  assert.equal(result.status,409);assert.equal(result.body.code,'ACCOUNT_ALREADY_REINVITED');assert.equal(fetcher.mock.calls.length,0);assert.ok(queries.includes('ROLLBACK'));
});

const archivedId = '00000000-0000-4000-8000-000000000092';
const replacementId = '00000000-0000-4000-8000-000000000093';
const unrelatedId = '00000000-0000-4000-8000-000000000094';

function reinvitationFixture(options: {
  role?: string;
  name?: string;
  specialty?: string | null;
  existingEmail?: boolean;
  createUnavailable?: boolean;
  failPersistence?: boolean;
  rejectInvite?: boolean;
  inviteUserId?: string;
} = {}) {
  const profile = Object.freeze({
    id: archivedId, role: options.role ?? 'doctor', full_name: options.name ?? 'Archived Doctor Fixture',
    email: `deleted+${archivedId}@accounts.invalid`, deleted_email: 'former@clinic-fixture.co.za',
    phone: '+27712345678', user_type: null, student_number: null, staff_number: null,
    department: 'Clinic', program: 'Historical programme', deleted_at: new Date('2026-10-15T00:00:00Z'),
  });
  const events: string[] = [];
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const requests: Array<{ method: string; path: string; body: any }> = [];
  mock.method(pool, 'connect', async () => ({
    release() { events.push('release'); },
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') events.push(sql);
      if (sql.includes('SELECT p.*')) return { rows: [profile], rowCount: 1 };
      if (sql.includes('SELECT new_user_id')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT specialty')) return { rows: [{ specialty: options.specialty === undefined ? 'Family Medicine' : options.specialty }], rowCount: 1 };
      if (sql.includes('INSERT INTO profiles')) events.push('profile');
      if (sql.includes('INSERT INTO clinic_doctors')) events.push('doctor');
      if (sql.includes('INSERT INTO account_invitations')) events.push('tracking');
      if (sql.includes('INSERT INTO account_reinvitations')) events.push('replacement-link');
      if (sql.includes('INSERT INTO audit_events')) {
        if (options.failPersistence) throw new Error('Private database fixture failure');
        events.push('audit');
      }
      if (sql.includes('INSERT INTO notifications')) events.push('notification');
      return { rows: [], rowCount: 1 };
    },
  }));
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const request = { method: init?.method ?? 'GET', path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    requests.push(request);
    if (request.path.endsWith('/auth/v1/admin/users') && request.method === 'POST') {
      events.push('create');
      if (options.existingEmail) return Response.json({ code: 'email_exists', message: 'Existing unconfirmed account' }, { status: 422, headers: { 'X-Supabase-Api-Version': '2024-01-01' } });
      if (options.createUnavailable) return Response.json({ message: 'Private account provider failure' }, { status: 503 });
      return Response.json({ id: replacementId, email: profile.deleted_email, app_metadata: request.body.app_metadata });
    }
    if (request.path.endsWith('/auth/v1/invite') && request.method === 'POST') {
      events.push('invite');
      if (options.rejectInvite) return Response.json({ message: 'Private delivery fixture failure' }, { status: 500 });
      return Response.json({ id: options.inviteUserId ?? replacementId, email: profile.deleted_email });
    }
    if (request.path.endsWith(`/auth/v1/admin/users/${replacementId}`) && request.method === 'DELETE') {
      events.push('delete-created');
      return Response.json({ id: replacementId });
    }
    throw new Error('Unexpected provider operation in reinvitation fixture');
  });
  return {
    profile, events, queries, requests,
    async call() {
      const { result, res } = response();
      await handler('/account-records/:id/reinvite')({ params: { id: archivedId }, body: {}, auth: { userId: '00000000-0000-4000-8000-000000000095', role: 'admin' } }, res);
      return result;
    },
  };
}

for (const role of ['doctor', 'receptionist', 'patient']) {
  test(`reinviting a ${role} creates a separate identity before provisioning and emails only that identity`, async () => {
    const fixture = reinvitationFixture({ role });
    const result = await fixture.call();
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.data, { id: replacementId, email: fixture.profile.deleted_email, role, invitationSent: true, previousUserId: archivedId });
    const create = fixture.requests.find(request => request.method === 'POST' && request.path.endsWith('/admin/users'))!;
    assert.equal(create.body.email_confirm, false);
    assert.deepEqual(create.body.app_metadata, { clinic_role: role, clinic_phone: fixture.profile.phone });
    assert.equal('password' in create.body, false, 'the invitee chooses their own password');
    assert.ok(fixture.events.indexOf('create') < fixture.events.indexOf('profile'));
    for (const step of ['profile', 'tracking', 'replacement-link', 'audit', 'notification']) {
      assert.ok(fixture.events.indexOf(step) < fixture.events.indexOf('invite'), step);
    }
    assert.ok(fixture.events.indexOf('invite') < fixture.events.indexOf('COMMIT'));
    assert.equal(fixture.requests.some(request => request.method === 'PUT' || request.method === 'DELETE'), false);
    const link = fixture.queries.find(query => query.sql.includes('INSERT INTO account_reinvitations'))!;
    assert.deepEqual(link.values.slice(0, 2), [archivedId, replacementId]);
    assert.equal(fixture.profile.id, archivedId);
    assert.equal(fixture.queries.some(query => /UPDATE\s+(appointments|patient_visits|prescriptions|lab_orders)\b/i.test(query.sql)), false);
    if (role === 'doctor') {
      assert.equal(fixture.queries.find(query => query.sql.includes('INSERT INTO clinic_doctors'))!.values[2], 'Family Medicine');
    }
  });
}

test('an existing unconfirmed email conflicts atomically without mutation, invitation or cleanup deletion', async () => {
  const fixture = reinvitationFixture({ existingEmail: true });
  const result = await fixture.call();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'ACCOUNT_EMAIL_IN_USE');
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.events.includes('profile'), false);
  assert.equal(fixture.events.includes('COMMIT'), false);
  assert.ok(fixture.events.includes('ROLLBACK'));
});

test('missing retained doctor name or specialty is rejected before creating an account or sending email', async () => {
  for (const options of [{ name: ' ' }, { specialty: null }]) {
    const fixture = reinvitationFixture(options);
    assert.equal((await fixture.call()).status, 422);
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.events.includes('profile'), false);
    mock.restoreAll();
  }
});

test('a provider outage during creation never becomes an email conflict or deletes an account', async () => {
  const fixture = reinvitationFixture({ createUnavailable: true });
  assert.equal((await fixture.call()).status, 503);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.events.includes('profile'), false);
  assert.equal(fixture.events.includes('delete-created'), false);
});

test('persistence failure rolls back and deletes only the newly created identity before any email', async () => {
  const fixture = reinvitationFixture({ failPersistence: true });
  const result = await fixture.call();
  assert.equal(result.status, 503);
  assert.ok(fixture.events.includes('ROLLBACK'));
  assert.equal(fixture.events.includes('COMMIT'), false);
  assert.equal(fixture.events.includes('invite'), false);
  const deletions = fixture.requests.filter(request => request.method === 'DELETE');
  assert.deepEqual(deletions.map(request => request.path.split('/').at(-1)), [replacementId]);
  assert.equal(JSON.stringify(result.body).includes('Private'), false);
});

test('an invitation acknowledgement for another identity is rejected without touching that identity', async () => {
  const fixture = reinvitationFixture({ inviteUserId: unrelatedId });
  assert.equal((await fixture.call()).status, 503);
  assert.ok(fixture.events.includes('ROLLBACK'));
  assert.equal(fixture.events.includes('COMMIT'), false);
  assert.deepEqual(fixture.requests.filter(request => request.method === 'DELETE').map(request => request.path.split('/').at(-1)), [replacementId]);
});

test('failed invitation delivery rolls back provisioning and cleans up only the newly created login', async () => {
  const fixture = reinvitationFixture({ rejectInvite: true });
  assert.equal((await fixture.call()).status, 503);
  assert.ok(fixture.events.includes('ROLLBACK'));
  assert.equal(fixture.events.includes('COMMIT'), false);
  assert.deepEqual(fixture.requests.filter(request => request.method === 'DELETE').map(request => request.path.split('/').at(-1)), [replacementId]);
});
