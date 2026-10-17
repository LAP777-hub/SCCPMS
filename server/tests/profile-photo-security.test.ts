import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { validateRequestSize } from '../src/security.js';

function checkSize(method: string, path: string, size: number) {
  const result = { nextCalls: 0, status: null as number | null, body: null as unknown };
  const req = { method, path, headers: { 'content-length': String(size), 'content-type': path === '/api/profile/photo' && method === 'PUT' ? 'image/png' : 'application/json' } } as Request;
  const res = {
    status(status: number) { result.status = status; return res; },
    json(body: unknown) { result.body = body; return res; },
  } as Response;
  validateRequestSize(req, res, () => { result.nextCalls++; });
  return result;
}

test('the photo upload size guard accepts exactly 5 MiB and rejects one byte more', () => {
  const limit = 5 * 1024 * 1024;
  assert.deepEqual(checkSize('PUT', '/api/profile/photo', limit), { nextCalls: 1, status: null, body: null });
  assert.deepEqual(checkSize('PUT', '/api/profile/photo', limit + 1), {
    nextCalls: 0, status: 413, body: { error: 'Request entity too large' },
  });
});

test('ordinary JSON routes retain the 256 KiB boundary after increasing the photo allowance', () => {
  const limit = 256 * 1024;
  for (const [method, path] of [['POST', '/api/appointments'], ['PATCH', '/api/profile'], ['PUT', '/api/clinic/settings']]) {
    assert.equal(checkSize(method, path, limit).nextCalls, 1, `${method} ${path} permits the JSON boundary`);
    const rejected = checkSize(method, path, limit + 1);
    assert.equal(rejected.status, 413, `${method} ${path} rejects the next byte`);
    assert.equal(rejected.nextCalls, 0);
  }
});

test('the larger allowance is limited to the exact photo upload method and path', () => {
  for (const [method, path] of [['DELETE', '/api/profile/photo'], ['POST', '/api/profile/photo'], ['PUT', '/api/profile/photo-other']]) {
    const rejected = checkSize(method, path, 256 * 1024 + 1);
    assert.equal(rejected.status, 413, `${method} ${path} keeps the ordinary size limit`);
    assert.equal(rejected.nextCalls, 0);
  }
});
