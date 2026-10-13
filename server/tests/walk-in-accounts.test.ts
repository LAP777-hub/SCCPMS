import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response } from 'express';
import clinical from '../src/clinical.routes.js';
import { pool } from '../src/db.js';

afterEach(() => mock.restoreAll());

async function updateWalkIn(method: 'post' | 'patch', active: boolean) {
  const patientId = randomUUID(),
    walkInId = randomUUID();
  const statements: string[] = [];
  const walkIn = {
    id: walkInId,
    status: 'waiting',
    patient_user_id: null,
    assigned_doctor_id: null,
    appointment_id: null,
  };
  mock.method(
    globalThis,
    'fetch',
    async () =>
      new globalThis.Response(
        JSON.stringify({ id: patientId, app_metadata: { clinic_role: 'patient' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  );
  mock.method(pool, 'connect', async () => ({
    release() {},
    async query(sql: string) {
      statements.push(sql);
      if (sql.startsWith('SELECT * FROM walk_ins')) return { rows: [walkIn], rowCount: 1 };
      if (sql.startsWith('SELECT active FROM account_status'))
        return { rows: [{ active }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO walk_ins') || sql.startsWith('UPDATE walk_ins'))
        return { rows: [{ ...walkIn, patient_user_id: patientId }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  }));
  const layer = clinical.stack.find(
    (item: any) =>
      item.route?.path === (method === 'post' ? '/walk-ins' : '/walk-ins/:id') &&
      item.route.methods[method]
  );
  assert.ok(layer);
  const result = { status: 200, body: undefined as any };
  const res = {
    status(value: number) {
      result.status = value;
      return res;
    },
    json(value: unknown) {
      result.body = value;
      return res;
    },
  };
  await layer.route.stack.at(-1).handle(
    {
      auth: { role: 'receptionist', userId: randomUUID() },
      params: { id: walkInId },
      body:
        method === 'post'
          ? {
              patientUserId: patientId,
              patientName: 'Fixture Patient',
              reason: 'Intake fixture',
              urgency: 'low',
            }
          : { status: 'waiting', patientUserId: patientId },
    } as unknown as Request,
    res as unknown as Response,
    () => {}
  );
  return { result, statements };
}

for (const method of ['post', 'patch'] as const) {
  test(`walk-in ${method} rejects inactive registered patients without modifying the queue`, async () => {
    const { result, statements } = await updateWalkIn(method, false);
    assert.equal(result.status, 422);
    assert.match(result.body.error, /inactive/);
    assert.equal(
      statements.some(
        (sql) => sql.startsWith('INSERT INTO walk_ins') || sql.startsWith('UPDATE walk_ins')
      ),
      false
    );
    assert.ok(statements.includes('ROLLBACK'));
    assert.equal(statements.includes('COMMIT'), false);
  });

  test(`walk-in ${method} serializes account activation with queue changes`, async () => {
    const { result, statements } = await updateWalkIn(method, true);
    assert.equal(result.status, method === 'post' ? 201 : 200);
    const locked = statements.findIndex(
      (sql) => sql.startsWith('SELECT active FROM account_status') && sql.includes('FOR UPDATE')
    );
    const written = statements.findIndex(
      (sql) => sql.startsWith('INSERT INTO walk_ins') || sql.startsWith('UPDATE walk_ins')
    );
    assert.ok(locked > statements.indexOf('BEGIN'));
    assert.ok(written > locked);
    assert.ok(statements.indexOf('COMMIT') > written);
  });
}
