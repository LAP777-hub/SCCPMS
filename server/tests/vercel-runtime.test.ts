import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { test } from 'node:test';

test('Vercel audit work is registered with waitUntil and the database pool gains lifecycle hooks', async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  const runtime = await import('../src/runtime.js');
  const symbol = Symbol.for('@vercel/request-context');
  const saved = (globalThis as Record<symbol, unknown>)[symbol];
  const registered: Promise<unknown>[] = [];
  (globalThis as Record<symbol, unknown>)[symbol] = { get: () => ({ waitUntil: (promise: Promise<unknown>) => registered.push(promise) }) };
  try {
    assert.equal(runtime.isVercelRuntime, true);
    const work = Promise.resolve('persisted audit');
    runtime.keepRequestWork(work);
    assert.equal(registered[0], work);
    assert.equal(await registered[0], 'persisted audit');
    const pool = Object.assign(new EventEmitter(), { options: { idleTimeoutMillis: 5000 } });
    runtime.manageDatabasePool(pool as unknown as Pool);
    assert.equal(pool.listenerCount('release'), 1);
  } finally {
    if (saved === undefined) delete (globalThis as Record<symbol, unknown>)[symbol];
    else (globalThis as Record<symbol, unknown>)[symbol] = saved;
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
