import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { requireAuth } from '../src/auth.js';
import { pool } from '../src/db.js';
import { logger } from '../src/logger.js';

afterEach(() => mock.restoreAll());
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;

async function requestAuthentication() {
  const req = { headers: { authorization: `Bearer ${token}` } } as Request;
  const res = { status: mock.fn(() => res), json: mock.fn() };
  const next = mock.fn();
  await requireAuth(req, res as unknown as Response, next);
  return { req, res, next };
}

async function authenticate(active: boolean, confirmed = true) {
  mock.method(pool, 'query', async () => ({ rows: [{ active }] }));
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const data = url.includes('/auth/v1/user')
      ? { id: userId, email: 'test@spu.ac.za', email_confirmed_at: confirmed ? '2026-10-12T00:00:00Z' : null, app_metadata: { clinic_role: 'patient', clinic_phone: '+27123456789' }, user_metadata: {} }
      : [{ id: userId, role: 'admin', email: 'attacker@spu.ac.za', phone: '+27999999999' }];
    return new globalThis.Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return requestAuthentication();
}

test('editing a client-visible profile cannot change account role or OTP destination', async () => {
  const { req, next } = await authenticate(true);
  assert.equal(next.mock.calls.length, 1);
  assert.equal(req.auth?.role, 'patient');
  assert.equal(req.auth?.email, 'test@spu.ac.za');
  assert.equal(req.auth?.phone, '+27123456789');
  assert.equal(req.auth?.profile.role, 'patient');
  assert.equal(req.auth?.profile.email, 'test@spu.ac.za');
  assert.equal(req.auth?.profile.phone, '+27123456789');
});

test('deactivated accounts cannot reach any protected workflow', async () => {
  const { next, res } = await authenticate(false);
  assert.equal(next.mock.calls.length, 0);
  assert.deepEqual(res.status.mock.calls[0].arguments, [403]);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], {
    error: 'Your account has been suspended. Contact admin: luckypinga077@gmail.com.',
    code: 'ACCOUNT_DISABLED',
  });
});

test('an unconfirmed email cannot access clinic APIs even with a valid session token', async () => {
  const { next, res } = await authenticate(true, false);
  assert.equal(next.mock.calls.length, 0);
  assert.deepEqual(res.status.mock.calls[0].arguments, [403]);
  assert.equal((res.json.mock.calls[0].arguments[0] as { code?: string }).code, 'EMAIL_CONFIRMATION_REQUIRED');
});

test('a database timeout during account-status validation fails closed with safe stage diagnostics', async () => {
  const databaseError = Object.assign(new Error('Sensitive connection details'), { code: 'ETIMEDOUT' });
  mock.method(pool, 'query', async () => { throw databaseError; });
  const diagnostic = mock.method(logger, 'error', () => undefined);
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const data = url.includes('/auth/v1/user')
      ? { id: userId, email: 'test@spu.ac.za', email_confirmed_at: '2026-10-12T00:00:00Z', app_metadata: { clinic_role: 'patient' }, user_metadata: {} }
      : [{ id: userId, role: 'patient', email: 'test@spu.ac.za' }];
    return new globalThis.Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const { req, res, next } = await requestAuthentication();
  assert.equal(next.mock.calls.length, 0);
  assert.equal(req.auth, undefined);
  assert.deepEqual(res.status.mock.calls[0].arguments, [503]);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], { error: 'Unable to validate your session right now.' });
  assert.equal(diagnostic.mock.calls.length, 1);
  assert.equal(diagnostic.mock.calls[0].arguments[0], 'Authentication validation unavailable');
  const logged = JSON.stringify(diagnostic.mock.calls[0].arguments.slice(1));
  assert.match(logged, /account-status/);
  assert.match(logged, /ETIMEDOUT/);
  assert.doesNotMatch(logged, /Sensitive connection details/);
  assert.doesNotMatch(logged, new RegExp(token));
});

const providerMessage = 'Provider diagnostics must not be returned to the client';
async function authenticateProviderFailure(status: number, code?: string, body?: string) {
  const query = mock.method(pool, 'query', async () => { throw new Error('Authentication failure must not reach clinical storage'); });
  const warning = mock.method(logger, 'warn', () => undefined);
  mock.method(globalThis, 'fetch', async () => new globalThis.Response(
    body ?? JSON.stringify({ message: providerMessage, ...(code ? { code } : {}) }),
    { status, headers: { 'Content-Type': body ? 'text/html' : 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } },
  ));
  const result = await requestAuthentication();
  assert.equal(query.mock.calls.length, 0);
  assert.equal(result.next.mock.calls.length, 0);
  assert.equal(result.req.auth, undefined);
  assert(!JSON.stringify(result.res.json.mock.calls).includes(providerMessage));
  assert(!JSON.stringify(warning.mock.calls).includes(providerMessage));
  assert(!JSON.stringify(warning.mock.calls).includes(token));
  return result;
}

for (const status of [400, 401, 403]) {
  test(`a provider-suspended account returns ACCOUNT_DISABLED on ${status} without clinic access`, async () => {
    const { res } = await authenticateProviderFailure(status, 'user_banned');
    assert.deepEqual(res.status.mock.calls[0].arguments, [403]);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], {
      error: 'Your account has been suspended. Contact admin: luckypinga077@gmail.com.',
      code: 'ACCOUNT_DISABLED',
    });
  });
}

for (const { status, code } of [
  { status: 429, code: 'over_request_rate_limit' },
  { status: 500, code: 'unexpected_failure' },
  { status: 503, code: 'unexpected_failure' },
  { status: 504, code: 'request_timeout' },
  { status: 520, code: undefined },
  { status: 408, code: 'request_timeout' },
  { status: 403, code: 'unexpected_failure' },
  { status: 403, code: 'provider_disabled' },
]) {
  test(`Auth provider ${status}/${code ?? 'no code'} preserves the session with 503`, async () => {
    const { res } = await authenticateProviderFailure(status, code);
    assert.deepEqual(res.status.mock.calls[0].arguments, [503]);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], { error: 'Unable to validate your session right now.' });
  });
}

test('a non-JSON Auth gateway outage preserves the session with 503', async () => {
  const { res } = await authenticateProviderFailure(502, undefined, '<html>Gateway unavailable</html>');
  assert.deepEqual(res.status.mock.calls[0].arguments, [503]);
});

test('a network failure preserves the session without exposing diagnostics', async () => {
  const query = mock.method(pool, 'query', async () => { throw new Error('Unexpected database access'); });
  const warning = mock.method(logger, 'warn', () => undefined);
  // The SDK logs fetch exceptions itself; suppress mock diagnostics in test output.
  mock.method(console, 'error', () => undefined);
  mock.method(globalThis, 'fetch', async () => { throw new TypeError(providerMessage); });
  const { req, res, next } = await requestAuthentication();
  assert.equal(query.mock.calls.length, 0);
  assert.equal(next.mock.calls.length, 0);
  assert.equal(req.auth, undefined);
  assert.deepEqual(res.status.mock.calls[0].arguments, [503]);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], { error: 'Unable to validate your session right now.' });
  assert(!JSON.stringify(warning.mock.calls).includes(providerMessage));
});

async function authenticateProfileProblem(problem: 'postgrest' | 'network' | 'missing' | 'invalid-role') {
  const query = mock.method(pool, 'query', async () => { throw new Error('A rejected profile lookup must not reach clinical storage'); });
  const warning = mock.method(logger, 'warn', () => undefined);
  let profileRequests = 0;
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith('/auth/v1/user')) {
      return globalThis.Response.json({ id: userId, email: 'test@spu.ac.za', email_confirmed_at: '2026-10-12T00:00:00Z', app_metadata: { clinic_role: problem === 'invalid-role' ? 'unsupported-role' : 'patient' }, user_metadata: {} });
    }
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      profileRequests += 1;
      if (problem === 'network') throw new TypeError(providerMessage);
      if (problem === 'postgrest') return globalThis.Response.json({ message: providerMessage, details: 'Sensitive profile storage diagnostics', hint: 'Private provider configuration', code: 'XX000' }, { status: 503 });
      return globalThis.Response.json(problem === 'missing' ? [] : [{ id: userId, role: 'patient', email: 'test@spu.ac.za' }]);
    }
    throw new Error('Unexpected external request blocked by profile lookup fixture');
  });
  const result = await requestAuthentication();
  assert.ok(profileRequests >= 1, 'the SDK may retry a temporary profile lookup failure');
  assert.equal(query.mock.calls.length, 0);
  assert.equal(result.next.mock.calls.length, 0);
  assert.equal(result.req.auth, undefined);
  const diagnostics = JSON.stringify([result.res.json.mock.calls, warning.mock.calls]);
  assert(!diagnostics.includes(providerMessage));
  assert(!diagnostics.includes('Sensitive profile storage diagnostics'));
  assert(!diagnostics.includes('Private provider configuration'));
  assert(!diagnostics.includes(token));
  return result;
}

for (const problem of ['postgrest', 'network'] as const) {
  test(`a temporary ${problem} profile lookup failure remains retryable with 503`, async () => {
    const { res } = await authenticateProfileProblem(problem);
    assert.deepEqual(res.status.mock.calls[0].arguments, [503]);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], { error: 'Unable to validate your session right now.' });
  });
}

test('a genuinely missing profile remains a permanent 403 after successful provider authentication', async () => {
  const { res } = await authenticateProfileProblem('missing');
  assert.deepEqual(res.status.mock.calls[0].arguments, [403]);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], { error: 'A valid account profile is required.' });
});

test('an invalid trusted role remains a permanent 403 even when a profile exists', async () => {
  const { res } = await authenticateProfileProblem('invalid-role');
  assert.deepEqual(res.status.mock.calls[0].arguments, [403]);
  assert.deepEqual(res.json.mock.calls[0].arguments[0], { error: 'A valid account profile is required.' });
});

for (const { status, code } of [
  { status: 401, code: 'bad_jwt' },
  { status: 403, code: 'bad_jwt' },
  { status: 403, code: 'session_expired' },
  { status: 404, code: 'session_not_found' },
  { status: 404, code: 'user_not_found' },
  { status: 401, code: undefined },
  { status: 403, code: undefined },
]) {
  test(`invalid Auth session ${status}/${code ?? 'legacy response'} still returns 401`, async () => {
    const { res } = await authenticateProviderFailure(status, code);
    assert.deepEqual(res.status.mock.calls[0].arguments, [401]);
    assert.equal((res.json.mock.calls[0].arguments[0] as { code: string }).code, 'SESSION_INVALID');
  });
}
