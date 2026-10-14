import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { pool } from '../src/db.js';
import { getOtpStatus } from '../src/otp.routes.js';
import { otpEmailHash } from '../src/otp-security.js';

afterEach(() => mock.restoreAll());

for (const verified of [true, false]) {
  test(`session restoration reports verified=${verified} from the database`, async () => {
    const query = mock.method(pool, 'query', async () => ({ rows: [{ verified, active_expires_at: null, retry_after_seconds: 0 }], rowCount: 1 }));
    const req = { auth: { userId: 'user-1', sessionId: 'session-1', email: 'patient@spu.ac.za' } } as Request;
    const json = mock.fn();
    const res = { json, status: mock.fn(() => res) };
    await getOtpStatus(req, res as unknown as Response);
    assert.deepEqual(json.mock.calls[0].arguments, [{ verified, activeChallenge: null, retryAfterSeconds: 0 }]);
    const [sql, parameters] = query.mock.calls[0].arguments;
    assert.match(String(sql), /expires_at > now\(\)/);
    assert.match(String(sql), /email_hash = \$3/);
    assert.deepEqual(parameters.slice(0, 3), ['user-1', 'session-1', otpEmailHash('user-1', 'patient@spu.ac.za')]);
  });
}

test('session restoration never grants access when the database is unavailable', async () => {
  mock.method(pool, 'query', async () => { throw new Error('offline'); });
  const req = { auth: { userId: 'user-1', sessionId: 'session-1', email: 'patient@spu.ac.za' } } as Request;
  const res = { status: mock.fn(() => res), json: mock.fn() };
  await getOtpStatus(req, res as unknown as Response);
  assert.deepEqual(res.status.mock.calls[0].arguments, [503]);
  assert.deepEqual(res.json.mock.calls[0].arguments, [{ error: 'Unable to verify your authentication state.' }]);
});
