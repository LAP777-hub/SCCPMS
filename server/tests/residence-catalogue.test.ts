import assert from 'node:assert/strict';
import { test } from 'node:test';
import { residenceSuggestions, residences } from '../src/residence-catalogue.js';

test('every published university residence and off-campus cluster is searchable without invented map coordinates', () => {
  assert.equal(residences.length, 23);
  for (const name of residences) {
    const matches = residenceSuggestions(name);
    assert.ok(matches.some(item => item.address.startsWith(name)));
    assert.ok(matches.every(item => item.source === 'spu' && item.latitude === null && item.longitude === null));
  }
  assert.equal(residenceSuggestions('student residences').length, 25);
  assert.equal(residenceSuggestions('Umnadi')[0].address.startsWith('Umnandi'), true);
  assert.equal(residenceSuggestions('ra thaga')[0].address.startsWith('Ra-Thaga'), true);
  assert.equal(residenceSuggestions('Long Street Loft')[0].address.startsWith('Long Street Loft'), true);
  for (const alias of ['RISE STUDENT LIVING ACCOMMODATION', 'MASSOUH RESIDENCE', 'HANETJIE HALL OF RESIDENCE', 'LONG STREET LOFTS', 'MY STUDEND SA ACCOMMODATION', 'SEA OF MOUNTAINS ACCOMMODATION']) assert.ok(residenceSuggestions(alias).length, alias);
  for (const name of ['Ntabiseng Courts', 'Lawson']) assert.equal(residenceSuggestions(name)[0].source, 'clinic');
  assert.deepEqual(residenceSuggestions('unknown private address 42'), []);
});
