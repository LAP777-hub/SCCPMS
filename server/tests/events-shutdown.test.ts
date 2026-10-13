import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mock, test } from 'node:test';
import pg from 'pg';
import events, { closeClinicEvents } from '../src/events.routes.js';

test('event shutdown releases pending listener once and rejects new streams', async () => {
  let completeListen!: () => void;
  const pending = new Promise<void>((resolve) => {
    completeListen = resolve;
  });
  const order: string[] = [];
  const client = Object.assign(new EventEmitter(), {
    async query() {
      await pending;
    },
    release() {
      order.push('listener.released');
    },
  });
  mock.method(pg.Pool.prototype, 'connect', async () => client);
  mock.method(pg.Pool.prototype, 'end', async () => {
    order.push('pool.closed');
  });
  const layer = events.stack.find(
    (item: any) => item.route?.path === '/' && item.route.methods.get
  );
  assert.ok(layer);
  const result = { status: 200 };
  const res = {
    status(value: number) {
      result.status = value;
      return res;
    },
    json() {
      return res;
    },
  };
  try {
    const request = layer.route.stack.at(-1).handle({}, res, () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    const shutdown = closeClinicEvents();
    assert.equal(closeClinicEvents(), shutdown, 'repeat signals share the same cleanup');
    assert.deepEqual(order, []);
    completeListen();
    await Promise.all([request, shutdown]);
    assert.equal(result.status, 503, 'a connection begun before shutdown never opens a new stream');
    assert.deepEqual(order, ['listener.released', 'pool.closed']);
    await layer.route.stack.at(-1).handle({}, res, () => {});
    assert.equal(result.status, 503);
    assert.equal(order.length, 2);
  } finally {
    completeListen();
    mock.restoreAll();
  }
});
