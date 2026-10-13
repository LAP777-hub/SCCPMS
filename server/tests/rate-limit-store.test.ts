import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Options } from 'express-rate-limit';
import { pool } from '../src/db.js';
import { PostgresRateLimitStore, RateLimitStorageUnavailable } from '../src/rate-limit-store.js';
import { reserveAddressSearchSlot } from '../src/address-provider-budget.js';
import { AddressSearch, AddressSearchUnavailable } from '../src/address-search.js';

afterEach(() => mock.restoreAll());

test('independent rate-limit instances share a namespaced private database key and reset deadline', async () => {
  const deadline = new Date(Date.now() + 60000);
  const stored = new Map<string, number>();
  const keys: string[] = [];
  mock.method(pool, 'query', async (_sql: string, values: unknown[]) => {
    const key = values[0] as string;
    keys.push(key);
    stored.set(key, (stored.get(key) ?? 0) + 1);
    return { rows: [{ hits: stored.get(key), reset_at: deadline }] };
  });
  const first = new PostgresRateLimitStore('registration');
  const second = new PostgresRateLimitStore('registration');
  first.init({ windowMs: 60000 } as Options);
  second.init({ windowMs: 60000 } as Options);
  assert.equal((await first.increment('fixture-client-ip')).totalHits, 1);
  assert.deepEqual(await second.increment('fixture-client-ip'), { totalHits: 2, resetTime: deadline });
  await new PostgresRateLimitStore('otp').increment('fixture-client-ip');
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
  assert(!keys.some(key => key.includes('fixture-client-ip')));
});

test('a shared rate-limit database failure denies the request without exposing connection details', async () => {
  mock.method(pool, 'query', async () => { throw new Error('private provider diagnostics'); });
  await assert.rejects(new PostgresRateLimitStore('registration').increment('fixture'), RateLimitStorageUnavailable);
});

test('a shared provider budget rejects searches without sending requests when quota or database is unavailable', async () => {
  const query = mock.method(pool, 'query', async () => ({ rows: [] }));
  await assert.rejects(reserveAddressSearchSlot('https://fixture.invalid/api/', 1100, 500), AddressSearchUnavailable);
  assert(!JSON.stringify(query.mock.calls).includes('student accommodation'));
  mock.method(pool, 'query', async () => { throw new Error('private database credentials'); });
  const fetchProvider = mock.fn(async () => { throw new Error('Provider must never be called.'); });
  const search = new AddressSearch({ endpoint: 'https://fixture.invalid/api/', intervalMs: 1100, dailyLimit: 500,
    reserveSlot: () => reserveAddressSearchSlot('https://fixture.invalid/api/', 1100, 500) }, fetchProvider as typeof fetch);
  await assert.rejects(search.search('student accommodation'), AddressSearchUnavailable);
  assert.equal(fetchProvider.mock.calls.length, 0);
});
