import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response } from 'express';
import pg from 'pg';
import events from '../src/events.routes.js';
import { pool } from '../src/db.js';
import {
  createClinicRevisionReader,
  recheckClinicEventAccess,
  serveServerlessClinicEvents,
} from '../src/serverless-events.js';
import { parseClinicStreamEvent } from '../../src/lib/realtimeProtocol.ts';

afterEach(() => mock.restoreAll());
const userId = '9b484799-49a4-444d-81df-c0e50c9d7fa7';
const sessionId = '6bbbf0af-7045-48df-ac33-69a061360086';
const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;

function fixture() {
  const req = Object.assign(new EventEmitter(), {
    headers: { authorization: `Bearer ${token}` },
    auth: {
      userId,
      sessionId,
      role: 'admin',
      email: 'fixture@example.test',
      phone: null,
      profile: {},
    },
    otpValidated: true,
  });
  let status = 200,
    ended = false,
    body: unknown;
  const chunks: string[] = [],
    headers: Record<string, string> = {};
  const res = Object.assign(new EventEmitter(), {
    get writableEnded() {
      return ended;
    },
    status(value: number) {
      status = value;
      return res;
    },
    json(value: unknown) {
      body = value;
      ended = true;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    flushHeaders() {},
    write(value: string) {
      chunks.push(value);
      return true;
    },
    end() {
      ended = true;
      res.emit('close');
    },
  });
  // Object.assign copies a getter's value; keep a live response-state getter.
  Object.defineProperty(res, 'writableEnded', { get: () => ended, configurable: true });
  return {
    req: req as unknown as Request,
    res: res as unknown as Response,
    chunks,
    headers,
    requestEmitter: req,
    responseEmitter: res,
    get status() {
      return status;
    },
    get body() {
      return body;
    },
    get ended() {
      return ended;
    },
  };
}

test('snapshot-floor revisions see lower event IDs committed after a later event', async () => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  let poll = 0;
  mock.method(pool, 'query', async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes('pg_snapshot_xmin')) return { rows: [{ floor: '100' }] };
    // Tx100/event1 commits after Tx101/event2. It must change the count even
    // though it would be behind a sequence cursor already advanced to event2.
    return {
      rows: [
        { table_name: 'appointments', revision: ++poll === 1 ? '1:event2' : '2:event1,event2' },
      ],
    };
  });
  const read = createClinicRevisionReader();
  assert.equal((await read()).get('appointments'), '1:event2');
  assert.equal((await read()).get('appointments'), '2:event1,event2');
  assert.equal(queries.filter((query) => query.sql.includes('pg_snapshot_xmin')).length, 1);
  for (const query of queries.slice(1)) {
    assert.match(query.sql, /transaction_id >= \$1::xid8/);
    assert.match(query.sql, /count\(\*\)/);
    assert.deepEqual(query.values, ['100']);
    assert.doesNotMatch(query.sql, /event_id\s*>/);
  }
});

test('a bounded stream emits only table invalidations and ends before its deadline', async () => {
  const data = fixture();
  let reads = 0;
  const started = Date.now();
  await serveServerlessClinicEvents(
    data.req,
    data.res,
    async () => new Map([['appointments', reads++ === 0 ? '1:event2' : '2:event1,event2']]),
    { durationMs: 35, pollMs: 5 }
  );
  assert.equal(data.ended, true);
  assert.ok(Date.now() - started < 500);
  const messages = data.chunks.filter((chunk) => chunk.startsWith('data:'));
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0].slice(5)), { changed: true, table: 'appointments' });
  assert.equal(data.headers['Cache-Control'], 'no-store, no-transform');
  assert.equal(data.requestEmitter.listenerCount('aborted'), 0);
  assert.equal(data.responseEmitter.listenerCount('close'), 0);
});

test('account suspension during an open stream sends an auth error and closes it', async () => {
  const data = fixture();
  let validations = 0;
  await serveServerlessClinicEvents(data.req, data.res, async () => new Map(), {
    durationMs: 200,
    pollMs: 5,
    recheckMs: 10,
    validate: async () => {
      validations++;
      return { ok: false, status: 403, code: 'ACCOUNT_DISABLED' };
    },
  });
  assert.equal(validations, 1);
  assert.ok(
    data.chunks.some(
      (chunk) => chunk.includes('event: auth-error') && chunk.includes('ACCOUNT_DISABLED')
    )
  );
  assert.equal(data.ended, true);
});

test('a transient auth outage ends synchronization without turning it into a logout', async () => {
  const data = fixture();
  await serveServerlessClinicEvents(data.req, data.res, async () => new Map(), {
    durationMs: 200,
    pollMs: 5,
    recheckMs: 10,
    validate: async () => ({ ok: false, status: 503 }),
  });
  assert.ok(data.chunks.some((chunk) => chunk.includes('event: sync-error')));
  assert.equal(
    data.chunks.some((chunk) => chunk.includes('event: auth-error')),
    false
  );
});

test('a role change closes the old stream and invalidates the trusted profile', async () => {
  const data = fixture();
  await serveServerlessClinicEvents(data.req, data.res, async () => new Map(), {
    durationMs: 200,
    pollMs: 5,
    recheckMs: 10,
    validate: async (req) => {
      req.auth!.role = 'doctor';
      return { ok: true, status: 200 };
    },
  });
  assert.ok(data.chunks.some((chunk) => chunk.includes('"table":"profiles"')));
  assert.equal(data.ended, true);
});

test('a database failure before opening uses HTTP503 rather than a successful empty stream', async () => {
  const data = fixture();
  await serveServerlessClinicEvents(data.req, data.res, async () => {
    throw new Error('Fixture database offline');
  });
  assert.equal(data.status, 503);
  assert.equal(data.headers['Content-Type'], undefined);
  assert.equal(data.chunks.length, 0);
});

test('a database failure after opening sends a retry event without writing JSON headers again', async () => {
  const data = fixture();
  let reads = 0;
  await serveServerlessClinicEvents(
    data.req,
    data.res,
    async () => {
      if (reads++ > 0) throw new Error('Fixture database offline');
      return new Map();
    },
    { durationMs: 200, pollMs: 5 }
  );
  assert.equal(data.status, 200);
  assert.ok(data.chunks.some((chunk) => chunk.includes('event: sync-error')));
  assert.equal(data.body, undefined);
  assert.equal(data.ended, true);
});

test('disconnect interrupts an outstanding read and removes every stream timer/listener', async () => {
  const data = fixture();
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let reads = 0;
  const stream = serveServerlessClinicEvents(
    data.req,
    data.res,
    async () => {
      if (reads++ === 0) return new Map();
      started();
      return new Promise<Map<string, string>>(() => {});
    },
    { durationMs: 10000, pollMs: 5 }
  );
  await reading;
  data.responseEmitter.emit('close');
  await stream;
  assert.equal(data.requestEmitter.listenerCount('aborted'), 0);
  assert.equal(data.responseEmitter.listenerCount('close'), 0);
  assert.equal(reads, 2);
});

test('Vercel event requests never acquire a process-local LISTEN connection', async () => {
  const original = process.env.VERCEL;
  process.env.VERCEL = '1';
  const data = fixture();
  mock.method(pool, 'query', async (sql: string) => ({
    rows: sql.includes('pg_snapshot_xmin') ? [{ floor: '100' }] : [],
  }));
  const connect = mock.method(pg.Pool.prototype, 'connect', async () => {
    throw new Error('A serverless stream must not LISTEN');
  });
  const route = events.stack.find(
    (item: any) => item.route?.path === '/' && item.route?.methods.get
  );
  data.responseEmitter.flushHeaders = () => {
    queueMicrotask(() => data.responseEmitter.emit('close'));
  };
  try {
    await route.route.stack.at(-1).handle(data.req, data.res);
    assert.equal(connect.mock.callCount(), 0);
  } finally {
    if (original === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = original;
  }
});

function mockAuth(active: boolean, verified: boolean) {
  let requests = 0;
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requests++;
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    const body = url.pathname.endsWith('/auth/v1/user')
      ? {
          id: userId,
          email: 'fixture@example.test',
          email_confirmed_at: '2026-10-13T00:00:00Z',
          app_metadata: { clinic_role: 'admin' },
        }
      : [{ id: userId, role: 'admin', email: 'fixture@example.test' }];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  mock.method(pool, 'query', async (sql: string) =>
    sql.includes('account_status')
      ? { rows: [{ active }], rowCount: 1 }
      : { rows: [], rowCount: verified ? 1 : 0 }
  );
  return () => requests;
}

test('stream revalidation clears cached Auth and OTP and detects a newly disabled account', async () => {
  const requests = mockAuth(false, true);
  const data = fixture();
  assert.deepEqual(await recheckClinicEventAccess(data.req), {
    ok: false,
    status: 403,
    code: 'ACCOUNT_DISABLED',
  });
  assert.equal(requests(), 2);
  assert.equal(data.req.otpValidated, undefined);
});

test('stream revalidation detects revoked OTP even if the request was initially verified', async () => {
  mockAuth(true, false);
  const data = fixture();
  assert.deepEqual(await recheckClinicEventAccess(data.req), {
    ok: false,
    status: 428,
    code: 'OTP_REQUIRED',
  });
  assert.equal(data.req.otpValidated, undefined);
});

test('the client parser handles named auth errors and ignores malformed or non-invalidation data', () => {
  assert.deepEqual(parseClinicStreamEvent('event: auth-error\ndata: {"code":"ACCOUNT_DISABLED"}'), {
    kind: 'auth-error',
    code: 'ACCOUNT_DISABLED',
  });
  assert.deepEqual(
    parseClinicStreamEvent(': heartbeat\ndata: {"changed":true,"table":"appointments"}'),
    { kind: 'change', table: 'appointments' }
  );
  assert.deepEqual(parseClinicStreamEvent('event: sync-error\ndata: {}'), { kind: 'sync-error' });
  assert.equal(parseClinicStreamEvent('data: {"patient_name":"Private data"}'), null);
  assert.equal(parseClinicStreamEvent('data: invalid'), null);
});
