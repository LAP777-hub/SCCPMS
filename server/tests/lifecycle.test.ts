import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { drainServer } from '../src/lifecycle.js';

test('shutdown completes pending HTTP work before closing database access', async () => {
  const order: string[] = [];
  let finishRequest!: () => void, requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  const pendingProvider = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  const server = createServer(async (_req, res) => {
    requestStarted();
    await pendingProvider;
    order.push('request.saved');
    res.end('saved');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = fetch(`http://127.0.0.1:${address.port}`).then((result) => result.text());
  await started;
  const shutdown = drainServer(
    server,
    async () => {
      order.push('streams.closed');
    },
    async () => {
      order.push('database.closed');
    }
  );
  assert.equal(server.listening, false, 'new requests stop before existing handlers finish');
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['streams.closed']);
  finishRequest();
  assert.equal(await response, 'saved');
  await shutdown;
  assert.deepEqual(order, ['streams.closed', 'request.saved', 'database.closed']);
});

test('a streaming cleanup failure still drains HTTP and closes database access', async () => {
  let closedDatabase = false;
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  await assert.rejects(
    drainServer(
      server,
      async () => {
        throw new Error('Fixture stream failure');
      },
      async () => {
        closedDatabase = true;
      }
    ),
    AggregateError
  );
  assert.equal(server.listening, false);
  assert.equal(closedDatabase, true);
});
