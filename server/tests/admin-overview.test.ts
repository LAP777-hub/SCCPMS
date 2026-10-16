import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Request, Response } from 'express';
import router from '../src/admin-overview.routes.js';
import { pool } from '../src/db.js';
import { adminOverview } from '../src/admin-overview.js';

async function call(role?: string, otpValidated = true) {
  const layer = router.stack.find((item: any) => item.route?.path === '/admin/overview');
  const output = { status: 200, body: undefined as any, headers: {} as Record<string, string> };
  const req = { headers: {}, auth: role ? { role, userId: 'fixture', sessionId: 'fixture', email: 'fixture@example.invalid' } : undefined, otpValidated } as unknown as Request;
  const res = { status(code: number) { output.status = code; return this; }, json(body: unknown) { output.body = body; return this; }, setHeader(name: string, value: string) { output.headers[name] = value; } } as unknown as Response;
  for (const handler of layer.route.stack) {
    let next = false;
    await handler.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return output;
}

test('overview denies unauthenticated and all non-admin roles before reading aggregate data', async () => {
  const query = mock.method(pool, 'query', async () => { throw Error('Unexpected database access'); });
  try {
    assert.equal((await call()).status, 401);
    for (const role of ['doctor', 'receptionist', 'patient', 'student', 'lecturer', 'staff']) assert.equal((await call(role)).status, 403);
    assert.equal(query.mock.callCount(), 0);
  } finally { query.mock.restore(); }
});

test('overview requires a valid OTP session even for an admin', async () => {
  const query = mock.method(pool, 'query', async () => ({ rows: [], rowCount: 0 }));
  try { assert.equal((await call('admin', false)).status, 428); assert.equal(query.mock.callCount(), 1); }
  finally { query.mock.restore(); }
});

test('overview returns the database snapshot without caching personal appointment data', async () => {
  const snapshot = { totals: { patients: 0, doctors: 0, appointments: 0, medicalRecords: 0 }, weeklyAppointments: [] };
  const query = mock.method(pool, 'query', async () => ({ rows: [snapshot], rowCount: 1 }));
  try { const result = await call('admin'); assert.equal(result.status, 200); assert.deepEqual(result.body, { data: snapshot }); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(query.mock.callCount(), 1); }
  finally { query.mock.restore(); }
});

test('a missing settings row or SQL outage fails safely instead of inventing zeros', async () => {
  const query = mock.method(pool, 'query', async () => ({ rows: [], rowCount: 0 }));
  try { const result = await call('admin'); assert.equal(result.status, 503); assert.equal(result.body.data, undefined); }
  finally { query.mock.restore(); }
  const failure = mock.method(pool, 'query', async () => { throw Error('private database connection detail'); });
  try { const result = await call('admin'); assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result), /private database/); }
  finally { failure.mock.restore(); }
});

test('overview SQL errors propagate to the route rather than becoming successful zero statistics', async () => {
  await assert.rejects(adminOverview({ query: async () => { throw Error('offline'); } } as unknown as Pick<typeof pool, 'query'>), /offline/);
});
