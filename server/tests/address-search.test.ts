import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AddressSearch, AddressSearchUnavailable, photonAddresses, kimberleyBounds } from '../src/address-search.js';

// Test fixtures model provider responses; live searches are verified separately.
const feature = (id: number, overrides: Record<string, unknown> = {}, coordinates = [24.7622587, -28.743706]) => ({
  geometry: { type: 'Point', coordinates },
  properties: { osm_type: 'W', osm_id: id, name: 'Long Street', city: 'Kimberley', state: 'Northern Cape', country: 'South Africa', countrycode: 'ZA', ...overrides },
});

test('Photon returns actual address parts, coordinates and OSM identifiers with New Park first', () => {
  const data = photonAddresses({ features: [feature(1, { locality: 'Albertynshof' }), feature(2, { locality: 'New Park' })] });
  assert.equal(data[0].address, 'Long Street, New Park, Kimberley, Northern Cape, South Africa');
  assert.equal(data[0].id, 'W2');
  assert.equal(data[0].latitude, -28.743706);
  assert.equal(data[0].longitude, 24.7622587);
  assert.equal(data[0].source, 'photon');
  assert.equal(data.length, 2);
});

test('addresses reject out-of-area/country and malformed results without fabricating replacements', () => {
  const data = photonAddresses({ features: [
    feature(1, {}, [18.4, -33.9]), feature(2, { countrycode: 'GB' }), feature(3, { city: 'Cape Town' }),
    feature(4, { state: 'Western Cape' }), { properties: {} },
  ] });
  assert.deepEqual(data, []);
  assert.throws(() => photonAddresses({ error: 'wrong response' }));
});

test('private accommodation results remain available and repeated address parts are deduplicated', () => {
  const data = photonAddresses({ features: [feature(1, { name: 'Private test accommodation', street: 'Long Street', locality: 'New Park' }), feature(2, { street: 'Long Street' }), feature(3, { street: 'Long Street' })] });
  assert.equal(data.length, 2);
  assert.match(data[0].address, /^Private test accommodation, Long Street, New Park/);
  assert.equal(data[1].address, 'Long Street, Kimberley, Northern Cape, South Africa');
});

test('shared autocomplete caches equivalent queries and coalesces concurrent requests', async () => {
  let calls = 0;
  const provider = (async () => { calls++; await Promise.resolve(); return Response.json({ features: [feature(1)] }); }) as typeof fetch;
  const service = new AddressSearch({ endpoint: 'https://provider.example/api/', intervalMs: 1100, dailyLimit: 1 }, provider);
  const [first, same] = await Promise.all([service.search('Long Street'), service.search(' long   street ')]);
  assert.deepEqual(first, same);
  assert.deepEqual(await service.search('LONG STREET'), first);
  assert.equal(calls, 1);
  await assert.rejects(service.search('New Park'), AddressSearchUnavailable);
});

test('provider requests set South African bounds and a New Park location bias', async () => {
  let captured: URL | undefined;
  const provider = (async (input: RequestInfo | URL) => { captured = new URL(String(input)); return Response.json({ features: [] }); }) as typeof fetch;
  await new AddressSearch({ endpoint: 'https://provider.example/api/', intervalMs: 1100, dailyLimit: 10 }, provider).search('New Park');
  assert.equal(captured!.searchParams.get('countrycode'), 'ZA');
  assert.equal(captured!.searchParams.get('lat'), '-28.7484301');
  assert.equal(captured!.searchParams.get('bbox'), `${kimberleyBounds.west},${kimberleyBounds.south},${kimberleyBounds.east},${kimberleyBounds.north}`);
});

test('provider errors and invalid responses produce a safe manual-entry fallback', async () => {
  for (const provider of [(async () => new Response(null, { status: 429 })), (async () => Response.json({ bad: true })), (async () => { throw new Error('Network failed'); })]) {
    const service = new AddressSearch({ endpoint: 'https://provider.example/api/', intervalMs: 1100, dailyLimit: 10 }, provider as typeof fetch);
    await assert.rejects(service.search('Long Street'), (error: unknown) => error instanceof AddressSearchUnavailable && /manually/.test(error.message));
  }
});

test('autocomplete starts provider requests at the configured global interval', async () => {
  const times: number[] = [];
  const provider = (async () => { times.push(Date.now()); return Response.json({ features: [] }); }) as typeof fetch;
  const service = new AddressSearch({ endpoint: 'https://provider.example/api/', intervalMs: 1100, dailyLimit: 10 }, provider);
  await Promise.all([service.search('Long Street'), service.search('New Park')]);
  assert.equal(times.length, 2);
  assert.ok(times[1] - times[0] >= 1050);
});
