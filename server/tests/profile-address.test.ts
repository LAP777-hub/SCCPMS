import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Request, Response as ExpressResponse } from 'express';
import api from '../src/api.routes.js';

afterEach(() => mock.restoreAll());

async function updateProfile(body: unknown) {
  let saved: Record<string, unknown> | undefined;
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /\/rest\/v1\/profiles/);
    assert.equal(init?.method, 'PATCH');
    saved = JSON.parse(String(init?.body));
    return Response.json({ id: '00000000-0000-4000-8000-000000000001', ...saved });
  });
  const route = api.stack.find((item: any) => item.route?.path === '/profile' && item.route?.methods.patch);
  assert.ok(route);
  let status = 200;
  const res = { status(code: number) { status = code; return res; }, json() { return res; } };
  await route.route.stack.at(-1).handle({ body, auth: {
    userId: '00000000-0000-4000-8000-000000000001', profile: { address_line1: 'Long Street, New Park, Kimberley' },
  } } as unknown as Request, res as unknown as ExpressResponse, () => {});
  return { saved, status };
}

test('editing residential address removes coordinates from the previously selected location', async () => {
  const { saved, status } = await updateProfile({ address_line1: 'A manually entered private address' });
  assert.equal(status, 200);
  assert.deepEqual(saved, { address_line1: 'A manually entered private address', address_latitude: null, address_longitude: null, address_source: 'manual' });
});

test('unrelated profile edits preserve address coordinates', async () => {
  const { saved, status } = await updateProfile({ full_name: 'Updated Name' });
  assert.equal(status, 200);
  assert.deepEqual(saved, { full_name: 'Updated Name' });
});

test('removing an address clears its coordinate source as well', async () => {
  const { saved, status } = await updateProfile({ address_line1: null });
  assert.equal(status, 200);
  assert.deepEqual(saved, { address_line1: null, address_latitude: null, address_longitude: null, address_source: null });
});
