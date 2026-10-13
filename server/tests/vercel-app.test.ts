import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import http from 'node:http';
import net from 'node:net';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

afterEach(() => mock.restoreAll());

test('the Vercel entry exports Express without binding a local port and retains HTTP/CORS/auth guards', async () => {
  const listen = mock.method(net.Server.prototype, 'listen', () => { throw new Error('Import must never open a port.'); });
  const { default: app } = await import('../src/app.js');
  assert.equal(typeof app, 'function');
  assert.equal(listen.mock.calls.length, 0);
  mock.restoreAll();
  mock.method(pool, 'query', async () => ({ rows: [{ connection_check: 1 }], rowCount: 1 }));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    assert.deepEqual(await fetch(origin).then(response => response.json()), { service: 'SCCPMS API', health: '/healthz' });
    assert.equal((await fetch(`${origin}/healthz`)).status, 200);
    for (const [method, path] of [['GET', '/auth/profile'], ['POST', '/auth/otp/send'], ['GET', '/api/patients']]) {
      const response = await fetch(`${origin}${path}`, { method, headers: { Origin: config.FRONTEND_ORIGIN } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('access-control-allow-origin'), config.FRONTEND_ORIGIN);
      assert.equal((await response.json()).code, 'SESSION_INVALID');
    }
    const preflight = await fetch(`${origin}/auth/otp/send`, { method: 'OPTIONS', headers: { Origin: config.FRONTEND_ORIGIN,
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/);
    assert.equal((await fetch(`${origin}/unknown`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
