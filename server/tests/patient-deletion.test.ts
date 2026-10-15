import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import api from '../src/api.routes.js';
import { pool } from '../src/db.js';

afterEach(() => mock.restoreAll());
const patientId = 'ce5ff150-15ee-4d25-b37e-fd3f0c86d6e5';
const adminId = 'fd8d6c6a-2806-487b-85f3-116b22c3c01b';
const deletedTime = new Date('2026-10-13T10:00:00Z');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

type FixtureOptions = {
  active?: boolean;
  profileRole?: string;
  authRole?: string;
  appointments?: boolean;
  walkIns?: boolean;
  providerFailures?: number;
  finalFailures?: number;
  reservationFailure?: boolean;
  missingOnRetry?: boolean;
  deleteGate?: ReturnType<typeof deferred>;
  updateGate?: ReturnType<typeof deferred>;
};

function fixture(options: FixtureOptions = {}) {
  const profile = { id: patientId, email: '202600001@spu.ac.za', full_name: 'Fixture Patient',
    role: options.profileRole || 'patient', phone: '+27111111111', user_type: 'Student',
    student_number: '202600001', deleted_email: null as string | null };
  const state = { active: options.active ?? false, deletion_requested_at: null as Date | null,
    deleted_at: null as Date | null, deleted_by: null as string | null };
  const audit: string[] = [];
  const queries: string[] = [];
  const external: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  const deleteStarted = deferred(), updateStarted = deferred();
  let providerFailures = options.providerFailures ?? 0;
  let finalFailures = options.finalFailures ?? 0;
  let authDeleted = false, verifiedSessions = true;
  let rowLock = Promise.resolve();
  mock.method(pool, 'connect', async () => {
    let releaseLock: (() => void) | undefined;
    let transaction: typeof state | undefined;
    let transactionProfile: typeof profile | undefined;
    let transactionAudit: string[] = [];
    let transactionVerified = verifiedSessions;
    return {
      async query(sql: string, values: unknown[] = []) {
        queries.push(sql);
        const empty = { rowCount: 0, rows: [] };
        if (sql === 'BEGIN') return empty;
        if (sql.includes('FROM account_status') && sql.includes('FOR UPDATE')) {
          const prior = rowLock;
          rowLock = new Promise<void>(resolve => { releaseLock = resolve; });
          await prior;
          transaction = { ...state };
          transactionProfile = { ...profile };
          transactionVerified = verifiedSessions;
          return { rowCount: 1, rows: [{ ...transaction }] };
        }
        if (sql === 'COMMIT') {
          if (transaction) {
            Object.assign(state, transaction);
            Object.assign(profile, transactionProfile);
            audit.push(...transactionAudit);
            verifiedSessions = transactionVerified;
          }
          transaction = undefined; transactionAudit = [];
          releaseLock?.(); releaseLock = undefined;
          return empty;
        }
        if (sql === 'ROLLBACK') {
          transaction = undefined; transactionAudit = [];
          releaseLock?.(); releaseLock = undefined;
          return empty;
        }
        if (sql.startsWith('SELECT id FROM clinic_doctors')) return empty;
        if (sql.startsWith('SELECT 1 FROM appointments')) return { rowCount: options.appointments ? 1 : 0, rows: [] };
        if (sql.startsWith('SELECT 1 FROM walk_ins')) return { rowCount: options.walkIns ? 1 : 0, rows: [] };
        if (sql.startsWith('INSERT INTO account_status') && sql.includes('active=EXCLUDED.active')) {
          assert.ok(transaction);
          transaction.active = Boolean(values[1]);
        }
        if (sql.startsWith('UPDATE account_status SET deletion_requested_at')) {
          assert.ok(transaction);
          transaction.deletion_requested_at = deletedTime;
          transaction.deleted_by = String(values[1]);
        }
        if (sql.startsWith('UPDATE account_status SET deleted_at')) {
          assert.ok(transaction);
          transaction.deleted_at = deletedTime;
          return { rowCount: 1, rows: [{ deleted_at: deletedTime }] };
        }
        if (sql.startsWith('UPDATE profiles SET deleted_email')) {
          assert.ok(transactionProfile);
          transactionProfile.deleted_email ??= transactionProfile.email;
          transactionProfile.email = String(values[1]);
        }
        if (sql.includes("'patient.deletion_requested'")) {
          if (options.reservationFailure) throw new Error('Fixture reservation audit failure');
          transactionAudit.push('patient.deletion_requested');
        }
        if (sql.includes("'patient.deleted'")) {
          if (finalFailures-- > 0) throw new Error('Fixture final audit failure');
          transactionAudit.push('patient.deleted');
        }
        if (sql.includes('INSERT INTO audit_events') && values[1] === 'patient.reactivated') transactionAudit.push('patient.reactivated');
        if (sql.startsWith('DELETE FROM otp_verified_sessions')) transactionVerified = false;
        return { rowCount: 1, rows: [] };
      },
      release() { releaseLock?.(); },
    };
  });
  mock.method(pool, 'query', async (sql: string) => {
    queries.push(sql);
    assert.match(sql, /FROM account_status/);
    return { rowCount: 1, rows: [{ user_id: patientId, ...state }] };
  });
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    external.push({ method, path: url.pathname, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
      { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      if (method === 'PATCH') return new Response(null, { status: 204 });
      return json([profile]);
    }
    if (url.pathname.endsWith(`/auth/v1/admin/users/${patientId}`)) {
      if (method === 'DELETE') {
        deleteStarted.resolve();
        await options.deleteGate?.promise;
        if (providerFailures-- > 0) return json({ message: 'Fixture provider unavailable' }, 503);
        if (authDeleted && options.missingOnRetry) return json({ message: 'User not found', code: 'user_not_found' }, 404);
        authDeleted = true;
      }
      if (method === 'PUT') {
        updateStarted.resolve();
        await options.updateGate?.promise;
      }
      return json({ id: patientId, email: profile.email,
        app_metadata: authDeleted ? {} : { clinic_role: options.authRole || profile.role, clinic_phone: profile.phone },
        ...(authDeleted ? { deleted_at: deletedTime.toISOString() } : {}) });
    }
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  });
  return { profile, state, audit, queries, external, deleteStarted, updateStarted,
    get authDeleted() { return authDeleted; }, get verifiedSessions() { return verifiedSessions; },
    deletions: () => external.filter(request => request.method === 'DELETE') };
}

async function call(method = 'delete', role = 'admin', body: unknown = {}, id = patientId, actor = adminId, family = 'patients') {
  const route = api.stack.find((item: any) => item.route?.path === `/${family}/:id` && item.route?.methods[method]);
  assert.ok(route);
  const result = { status: 200, body: undefined as any };
  const res = { status(code: number) { result.status = code; return res; }, json(value: unknown) { result.body = value; return res; } };
  for (const item of route.route.stack) {
    let next = false;
    await item.handle({ params: { id }, auth: { userId: actor, role }, body }, res, () => { next = true; });
    if (!next) break;
  }
  return result;
}

for (const profileRole of ['doctor','receptionist']) {
  test(`an administrator deletes a deactivated ${profileRole} while preserving profile identity and revoking credentials`, async () => {
    const data = fixture({ profileRole });
    const result = await call('delete','admin',{},patientId,adminId,'staff');
    assert.equal(result.status,200);
    assert.ok(data.state.deleted_at);
    assert.equal(data.profile.deleted_email,'202600001@spu.ac.za');
    assert.equal(data.authDeleted,true);
    assert.equal(data.verifiedSessions,false);
    assert.equal(data.deletions()[0].body?.should_soft_delete,true);
    assert.ok(data.queries.some(query=>query.includes('INSERT INTO notifications')));
  });
  test(`active ${profileRole} deletion is refused before any provider delete`, async () => {
    const data = fixture({ profileRole,active:true });
    assert.equal((await call('delete','admin',{},patientId,adminId,'staff')).status,409);
    assert.equal(data.deletions().length,0);
  });
}
test('staff deletion rejects other roles and retains pending deletion when its provider fails', async () => {
  const data = fixture({ profileRole:'doctor', providerFailures:1 });
  for (const role of ['doctor','patient','receptionist']) assert.equal((await call('delete',role,{},patientId,adminId,'staff')).status,403);
  const first = await call('delete','admin',{},patientId,adminId,'staff');
  assert.equal(first.status,503);
  assert.equal(first.body.code,'STAFF_DELETION_PENDING');
  assert.equal(data.state.active,false);
  assert.ok(data.state.deletion_requested_at);
  assert.equal((await call('delete','admin',{},patientId,adminId,'staff')).status,200);
});

test('only administrators can delete patient login accounts', async () => {
  const data = fixture();
  for (const role of ['receptionist', 'doctor', 'patient']) assert.equal((await call('delete', role)).status, 403);
  assert.equal(data.external.length, 0);
  assert.equal(data.queries.length, 0);
});

test('the deletion handler also rejects non-admin callers when middleware is bypassed', async () => {
  const data = fixture();
  const route = api.stack.find((item: any) => item.route?.path === '/patients/:id' && item.route?.methods.delete);
  let status = 200;
  const res = { status(code: number) { status = code; return res; }, json() { return res; } };
  await route.route.stack.at(-1).handle({ params: { id: patientId }, auth: { role: 'receptionist', userId: adminId } }, res);
  assert.equal(status, 403);
  assert.equal(data.external.length, 0);
});

test('invalid account IDs and self deletion are rejected before provider or database work', async () => {
  const data = fixture();
  assert.equal((await call('delete', 'admin', {}, 'invalid')).status, 400);
  assert.equal((await call('delete', 'admin', {}, patientId, patientId)).status, 422);
  assert.equal(data.external.length, 0);
  assert.equal(data.queries.length, 0);
});

for (const role of ['doctor', 'receptionist', 'admin']) {
  test(`the patient deletion route rejects ${role} profiles`, async () => {
    const data = fixture({ profileRole: role });
    assert.equal((await call()).status, 404);
    assert.equal(data.deletions().length, 0);
    assert.equal(data.state.deletion_requested_at, null);
  });
}

test('a staff Auth role cannot be deleted through a patient profile', async () => {
  const data = fixture({ authRole: 'doctor' });
  assert.equal((await call()).status, 404);
  assert.equal(data.deletions().length, 0);
});

test('an active patient must be deactivated before deletion', async () => {
  const data = fixture({ active: true });
  const result = await call();
  assert.equal(result.status, 409);
  assert.match(result.body.error, /Deactivate/);
  assert.equal(data.deletions().length, 0);
  assert.equal(data.state.deletion_requested_at, null);
});

test('PATCH deactivation stays reversible and distinct from permanent DELETE', async () => {
  const data = fixture({ active: true });
  assert.equal((await call('patch', 'admin', { active: false })).status, 200);
  assert.equal(data.state.active, false);
  assert.equal(data.state.deletion_requested_at, null);
  assert.equal(data.deletions().length, 0);
  assert.equal((await call('patch', 'admin', { active: true })).status, 200);
  assert.equal(data.state.active, true);
  assert.equal((await call('patch', 'admin', { active: false })).status, 200);
  assert.equal((await call()).status, 200);
  assert.equal(data.authDeleted, true);
});

for (const conflict of ['appointments', 'walkIns'] as const) {
  test(`deletion refuses active ${conflict} even on an already inactive patient`, async () => {
    const data = fixture({ [conflict]: true });
    assert.equal((await call()).status, 409);
    assert.equal(data.deletions().length, 0);
    assert.equal(data.state.deletion_requested_at, null);
  });
}

test('patient deletion irreversibly removes Auth credentials, revokes OTP and archives history identity', async () => {
  const data = fixture();
  assert.equal((await call()).status, 200);
  assert.deepEqual(data.deletions()[0].body, { should_soft_delete: true });
  assert.equal(data.authDeleted, true);
  assert.equal(data.verifiedSessions, false);
  assert.equal(data.state.active, false);
  assert.equal(data.state.deleted_by, adminId);
  assert.deepEqual(data.state.deleted_at, deletedTime);
  assert.equal(data.profile.deleted_email, '202600001@spu.ac.za');
  assert.equal(data.profile.email, `deleted+${patientId}@accounts.invalid`);
  assert.equal(data.profile.full_name, 'Fixture Patient');
  assert.equal(data.profile.student_number, '202600001');
  assert.deepEqual(data.audit, ['patient.deletion_requested', 'patient.deleted']);
  assert.equal(data.queries.some(sql => /DELETE FROM (profiles|appointments|patient_visits|prescriptions|lab_orders|audit_events|walk_ins)\b/.test(sql)), false);
});

test('failed Auth deletion retains an inactive nonreactivatable reservation and can be retried', async () => {
  const data = fixture({ providerFailures: 1 });
  const failed = await call();
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, 'PATIENT_DELETION_PENDING');
  assert.ok(data.state.deletion_requested_at);
  assert.equal(data.state.deleted_at, null);
  assert.equal(data.profile.email, '202600001@spu.ac.za');
  assert.equal(data.verifiedSessions, false);
  assert.equal((await call('patch', 'admin', { active: true })).status, 409);
  assert.equal((await call('patch', 'receptionist', { fullName: 'Changed Fixture' })).status, 409);
  assert.equal(data.external.some(request => request.method === 'PUT' || request.method === 'PATCH'), false);
  assert.equal((await call()).status, 200);
  assert.deepEqual(data.audit, ['patient.deletion_requested', 'patient.deleted']);
});

test('an audit failure before reservation commit performs no Auth deletion or OTP revocation', async () => {
  const data = fixture({ reservationFailure: true });
  assert.equal((await call()).status, 503);
  assert.equal(data.state.deletion_requested_at, null);
  assert.equal(data.deletions().length, 0);
  assert.equal(data.verifiedSessions, true);
  assert.deepEqual(data.audit, []);
});

test('failed finalization keeps a retryable marker and rolls back archived email and completion together', async () => {
  const data = fixture({ finalFailures: 1, missingOnRetry: true });
  assert.equal((await call()).body.code, 'PATIENT_DELETION_PENDING');
  assert.equal(data.authDeleted, true);
  assert.equal(data.state.deleted_at, null);
  assert.equal(data.profile.email, '202600001@spu.ac.za');
  assert.equal(data.profile.deleted_email, null);
  assert.equal((await call()).status, 200, 'an already removed Auth user is safe to finalize');
  assert.equal(data.profile.deleted_email, '202600001@spu.ac.za');
  assert.deepEqual(data.audit, ['patient.deletion_requested', 'patient.deleted']);
});

test('completed deletion retries do not call Auth again or duplicate its audit event', async () => {
  const data = fixture();
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 200);
  assert.equal(data.deletions().length, 1);
  assert.deepEqual(data.audit, ['patient.deletion_requested', 'patient.deleted']);
  assert.equal((await call('patch', 'admin', { active: true })).status, 409);
});

test('an in-flight deletion blocks a concurrent reactivation before Auth credentials can be restored', async () => {
  const gate = deferred();
  const data = fixture({ deleteGate: gate });
  const deletion = call();
  await data.deleteStarted.promise;
  try {
    assert.equal((await call('patch', 'admin', { active: true })).status, 409);
    assert.equal(data.external.some(request => request.method === 'PUT'), false);
    assert.equal(data.state.active, false);
  } finally { gate.resolve(); }
  assert.equal((await deletion).status, 200);
});

test('a reactivation that holds the account row first makes concurrent deletion reject the active account', async () => {
  const gate = deferred();
  const data = fixture({ updateGate: gate });
  const reactivation = call('patch', 'admin', { active: true });
  await data.updateStarted.promise;
  const deletion = call();
  gate.resolve();
  assert.equal((await reactivation).status, 200);
  assert.equal((await deletion).status, 409);
  assert.equal(data.state.active, true);
  assert.equal(data.deletions().length, 0);
  assert.equal(data.state.deletion_requested_at, null);
});

test('concurrent deletion retries finish exactly one completion audit event', async () => {
  const gate = deferred();
  const data = fixture({ deleteGate: gate });
  const first = call();
  await data.deleteStarted.promise;
  const second = call();
  gate.resolve();
  assert.deepEqual((await Promise.all([first, second])).map(result => result.status), [200, 200]);
  assert.deepEqual(data.audit, ['patient.deletion_requested', 'patient.deleted']);
});

test('the operational patient directory exposes pending state and excludes completed deletions', async () => {
  const data = fixture({ providerFailures: 1 });
  const route = api.stack.find((item: any) => item.route?.path === '/patients' && item.route?.methods.get);
  async function patients() {
    let result: any;
    await route.route.stack.at(-1).handle({}, { json(value: unknown) { result = value; }, status() { throw new Error('Unexpected fixture failure'); } });
    return result.data;
  }
  await call();
  const pending = await patients();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].active, false);
  assert.ok(pending[0].deletion_requested_at);
  await call();
  assert.deepEqual(await patients(), []);
});
