import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { requireAuth, allowRoles } from '../src/auth.js';

describe('Authentication Middleware', () => {
  describe('requireAuth', () => {
    it('should reject requests without authorization header', async () => {
      const req = { headers: {} } as any;
      const res = { status: mock.fn(() => res), json: mock.fn() } as any;
      const next = mock.fn();

      await requireAuth(req, res, next);

      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.strictEqual(res.json.mock.calls[0].arguments[0].error, 'Sign in is required.');
      assert.strictEqual(next.mock.calls.length, 0);
    });

    it('should reject requests with invalid token format', async () => {
      const req = { headers: { authorization: 'InvalidFormat token' } } as any;
      const res = { status: mock.fn(() => res), json: mock.fn() } as any;
      const next = mock.fn();

      await requireAuth(req, res, next);

      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.strictEqual(next.mock.calls.length, 0);
    });
  });

  describe('allowRoles', () => {
    it('should allow requests with matching role', () => {
      const middleware = allowRoles('admin', 'doctor');
      const req = { auth: { role: 'admin' } } as any;
      const res = { status: mock.fn(() => res), json: mock.fn() } as any;
      const next = mock.fn();

      middleware(req, res, next);

      assert.strictEqual(next.mock.calls.length, 1);
      assert.strictEqual(res.status.mock.calls.length, 0);
    });

    it('should reject requests without matching role', () => {
      const middleware = allowRoles('admin', 'doctor');
      const req = { auth: { role: 'patient' } } as any;
      const res = { status: mock.fn(() => res), json: mock.fn() } as any;
      const next = mock.fn();

      middleware(req, res, next);

      assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
      assert.strictEqual(next.mock.calls.length, 0);
    });

    it('should reject requests without auth context', () => {
      const middleware = allowRoles('admin');
      const req = {} as any;
      const res = { status: mock.fn(() => res), json: mock.fn() } as any;
      const next = mock.fn();

      middleware(req, res, next);

      assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);
      assert.strictEqual(next.mock.calls.length, 0);
    });
  });
});