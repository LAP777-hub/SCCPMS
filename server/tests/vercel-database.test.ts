import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, mock, test } from 'node:test';
import pg, { type Pool, type PoolClient } from 'pg';
import type { Options } from 'express-rate-limit';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { databaseOptions } from '../src/database-ssl.js';
import { PostgresRateLimitStore } from '../src/rate-limit-store.js';
import { reserveAddressSearchSlot } from '../src/address-provider-budget.js';
import { AddressSearchUnavailable } from '../src/address-search.js';
import { createClinicRevisionReader } from '../src/serverless-events.js';

const integrationOptions = { skip: process.env.RUN_DATABASE_TESTS !== '1' };

after(async () => { await pool.end(); });

async function withPrivateDatabase(work: (database: Pool, schema: string) => Promise<void>) {
  const schema = `clinic_vercel_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^clinic_vercel_test_[a-f0-9]{32}$/);
  const control = new pg.Pool({ ...databaseOptions(config), max: 1, connectionTimeoutMillis: 10_000 });
  const database = new pg.Pool({
    ...databaseOptions(config),
    options: `-c search_path=${schema},pg_catalog`,
    application_name: schema,
    max: 3,
    connectionTimeoutMillis: 10_000,
  });
  let created = false;
  try {
    await control.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    assert.equal((await database.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    const roles = await database.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') ORDER BY rolname");
    assert.deepEqual(roles.rows.map(row => row.rolname), ['anon', 'authenticated'], 'the isolated test database must provide the existing Auth roles');
    for (const migration of ['020_serverless_clinic_events.sql', '021_shared_request_limits.sql']) {
      await database.query(await readFile(new URL(`../sql/${migration}`, import.meta.url), 'utf8'));
    }
    await database.query(`
      CREATE TABLE appointments (id integer PRIMARY KEY, status text NOT NULL);
      CREATE TRIGGER isolated_appointments_change AFTER INSERT OR UPDATE OR DELETE ON appointments
        FOR EACH STATEMENT EXECUTE FUNCTION notify_clinic_change();
    `);
    const query = mock.method(pool, 'query', database.query.bind(database));
    try { await work(database, schema); }
    finally { query.mock.restore(); }
  } finally {
    try {
      await database.end();
      if (created) {
        assert.match(schema, /^clinic_vercel_test_[a-f0-9]{32}$/);
        await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        assert.equal((await control.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].count, 0);
      }
    } finally { await control.end(); }
  }
}

function permissionDenied(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';
}

test('Vercel rate limits and address budgets are shared, expire correctly and deny anonymous table access', integrationOptions, async () => {
  await withPrivateDatabase(async (database, schema) => {
    const first = new PostgresRateLimitStore('registration');
    const second = new PostgresRateLimitStore('registration');
    first.init({ windowMs: 60_000 } as Options);
    second.init({ windowMs: 60_000 } as Options);
    const clientKey = '192.0.2.17';
    const hits = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? second : first).increment(clientKey)));
    assert.deepEqual(hits.map(result => result.totalHits).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(new Set(hits.map(result => result.resetTime!.getTime())).size, 1, 'scaled instances share one fixed-window deadline');

    const otherNamespace = new PostgresRateLimitStore('otp');
    assert.equal((await otherNamespace.increment(clientKey)).totalHits, 1);
    const counters = (await database.query('SELECT bucket_key,hits FROM api_rate_limits ORDER BY bucket_key')).rows;
    assert.equal(counters.length, 2);
    assert.deepEqual(counters.map(row => row.hits).sort((a, b) => a - b), [1, 8]);
    assert.ok(counters.every(row => /^(registration|otp):[a-f0-9]{64}$/.test(row.bucket_key)));
    assert.ok(counters.every(row => !row.bucket_key.includes(clientKey)), 'request identity is not stored as a plaintext counter key');

    const expired = await database.query("UPDATE api_rate_limits SET reset_at=clock_timestamp()-interval '1 second' WHERE bucket_key LIKE 'registration:%' RETURNING reset_at");
    const renewed = await second.increment(clientKey);
    assert.equal(renewed.totalHits, 1);
    assert.ok(renewed.resetTime! > expired.rows[0].reset_at);
    assert.equal((await database.query("SELECT reset_at > clock_timestamp() AS future FROM api_rate_limits WHERE bucket_key LIKE 'registration:%'")).rows[0].future, true);
    await first.decrement(clientKey);
    await second.decrement(clientKey);
    assert.equal((await database.query("SELECT hits FROM api_rate_limits WHERE bucket_key LIKE 'registration:%'")).rows[0].hits, 0);
    await first.resetKey(clientKey);
    assert.deepEqual((await database.query('SELECT hits FROM api_rate_limits')).rows.map(row => row.hits), [1], 'resetting one namespace preserves the other');

    const endpoint = 'https://provider.example.invalid/api/';
    assert.equal(await reserveAddressSearchSlot(endpoint, 1100, 2), 0);
    const secondDelay = await reserveAddressSearchSlot(endpoint, 1100, 2);
    assert.ok(secondDelay >= 0 && secondDelay <= 2200);
    await assert.rejects(reserveAddressSearchSlot(endpoint, 1100, 2), AddressSearchUnavailable);
    assert.equal((await database.query('SELECT requests FROM address_provider_budget')).rows[0].requests, 2, 'a rejected reservation does not consume another provider request');
    await database.query("UPDATE address_provider_budget SET budget_day=(clock_timestamp() AT TIME ZONE 'UTC')::date-1, next_request_at=clock_timestamp()-interval '1 second'");
    assert.equal(await reserveAddressSearchSlot(endpoint, 1100, 2), 0);
    const rollover = (await database.query("SELECT requests,budget_day=(clock_timestamp() AT TIME ZONE 'UTC')::date AS current_day FROM address_provider_budget")).rows[0];
    assert.deepEqual(rollover, { requests: 1, current_day: true });

    const privateTables = ['api_rate_limits', 'address_provider_budget', 'clinic_change_events'];
    await database.query(`GRANT USAGE ON SCHEMA "${schema}" TO anon`);
    for (const table of privateTables) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await database.query('SELECT has_table_privilege($1::name,$2::text,\'SELECT\') AS permitted', [role, `${schema}.${table}`])).rows[0].permitted, false);
      }
    }
    const anonymous = await database.connect();
    try {
      for (const table of privateTables) {
        await anonymous.query('BEGIN');
        try {
          await anonymous.query('SET LOCAL ROLE anon');
          await assert.rejects(anonymous.query(`SELECT * FROM "${schema}"."${table}"`), permissionDenied);
        } finally { await anonymous.query('ROLLBACK'); }
      }
    } finally { anonymous.release(); }
  });
});

test('Vercel revision snapshots observe a lower event ID committed after a newer transaction', integrationOptions, async () => {
  await withPrivateDatabase(async database => {
    let older: PoolClient | undefined;
    let newer: PoolClient | undefined;
    try {
      older = await database.connect();
      newer = await database.connect();
      await older.query('BEGIN');
      await older.query("INSERT INTO appointments VALUES (1,'scheduled')");
      const oldEvent = (await older.query('SELECT event_id::text,transaction_id::text FROM clinic_change_events')).rows[0];
      const read = createClinicRevisionReader();
      assert.equal((await read()).size, 0, 'the snapshot floor is captured on the third connection while the old event is uncommitted');

      await newer.query('BEGIN');
      await newer.query("INSERT INTO appointments VALUES (2,'scheduled')");
      const newEvent = (await newer.query('SELECT event_id::text,transaction_id::text FROM clinic_change_events')).rows[0];
      assert.ok(BigInt(newEvent.event_id) > BigInt(oldEvent.event_id));
      assert.ok(BigInt(newEvent.transaction_id) > BigInt(oldEvent.transaction_id));
      await newer.query('COMMIT');
      const firstRevision = (await read()).get('appointments');
      assert.match(firstRevision!, /^1:[a-f0-9]{32}$/);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM clinic_change_events')).rows[0].count, 1);

      await older.query('COMMIT');
      const afterLateCommit = await read();
      assert.match(afterLateCommit.get('appointments')!, /^2:[a-f0-9]{32}$/);
      assert.notEqual(afterLateCommit.get('appointments'), firstRevision, 'the late lower-ID event still invalidates the table revision');
      assert.equal((await database.query('SELECT count(*)::int AS count FROM clinic_change_events')).rows[0].count, 2);
      assert.deepEqual(await read(), afterLateCommit, 'an unchanged database produces a stable revision');
      assert.deepEqual((await database.query('SELECT id,status FROM appointments ORDER BY id')).rows, [{ id: 1, status: 'scheduled' }, { id: 2, status: 'scheduled' }]);
    } finally {
      for (const client of [older, newer]) {
        if (client) {
          await client.query('ROLLBACK').catch(() => undefined);
          client.release();
        }
      }
    }
  });
});
