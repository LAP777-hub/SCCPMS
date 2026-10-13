import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response } from 'express';
import api from '../src/api.routes.js';
import { pool } from '../src/db.js';

afterEach(() => mock.restoreAll());

test('failed account archive restores provider phone, profile and ban while rolling back clinic changes', async () => {
  const userId = 'c4681340-de9f-469c-a5aa-f4a150536280';
  const oldProfile = {
    id: userId,
    email: 'fixture@example.test',
    full_name: 'Original Fixture',
    role: 'doctor',
    phone: '+27111111111',
    department: 'Original department',
  };
  const authWrites: Record<string, any>[] = [];
  const profileWrites: Record<string, any>[] = [];
  const statements: string[] = [];
  mock.method(pool, 'connect', async () => ({
    async query(sql: string) {
      statements.push(sql);
      if (sql.includes('INSERT INTO audit_events')) throw new Error('Audit storage unavailable');
      if (sql.includes('SELECT id FROM clinic_doctors'))
        return { rowCount: 1, rows: [{ id: 'fixture-doctor' }] };
      if (sql.startsWith('SELECT 1')) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ active: true }] };
    },
    release() {},
  }));
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    if (url.pathname.includes('/auth/v1/admin/users/')) {
      if (init?.method === 'PUT') authWrites.push(JSON.parse(String(init.body)));
      return new globalThis.Response(
        JSON.stringify({
          id: userId,
          email: oldProfile.email,
          app_metadata: { clinic_role: 'doctor', clinic_phone: oldProfile.phone },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      if (init?.method === 'PATCH') {
        profileWrites.push(JSON.parse(String(init.body)));
        return new globalThis.Response(null, { status: 204 });
      }
      return new globalThis.Response(JSON.stringify([oldProfile]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected external request');
  });
  const route = api.stack.find(
    (item: any) => item.route?.path === '/staff/:id' && item.route?.methods.patch
  );
  assert.ok(route);
  const result = { status: 200, body: undefined as any };
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(value: unknown) {
      result.body = value;
      return res;
    },
  };
  await route.route.stack
    .at(-1)
    .handle(
      {
        params: { id: userId },
        auth: { role: 'admin', userId: 'ed99c453-20db-4477-9277-c04c73a3c1b6' },
        body: { fullName: 'Changed Fixture', phone: '+27222222222', active: false },
      } as unknown as Request,
      res as unknown as Response,
      () => {}
    );
  assert.equal(result.status, 503);
  assert.ok(statements.includes('ROLLBACK'));
  assert.equal(statements.includes('COMMIT'), false);
  assert.equal(authWrites.length, 2);
  assert.equal(authWrites[0].app_metadata.clinic_phone, '+27222222222');
  assert.equal(authWrites[1].app_metadata.clinic_phone, oldProfile.phone);
  assert.equal(authWrites[1].ban_duration, 'none');
  assert.equal(profileWrites.length, 2);
  assert.equal(profileWrites[1].full_name, oldProfile.full_name);
  assert.equal(profileWrites[1].phone, oldProfile.phone);
});
