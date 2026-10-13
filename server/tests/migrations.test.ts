import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
// Native JavaScript keeps migrations available in the production-only image.
import { runMigrations } from '../scripts/migrate.mjs';

test('production migration runner rolls back failed SQL and releases its database client', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clinic-migration-test-'));
  const statements: string[] = [];
  await writeFile(join(directory, '001_fixture.sql'), 'fixture migration failure');
  const pool = {
    async query() {
      return { rowCount: 0 };
    },
    async connect() {
      return {
        async query(sql: string) {
          statements.push(sql);
          if (sql === 'fixture migration failure') throw new Error('Fixture migration failed');
          return { rowCount: 0 };
        },
        release() {
          statements.push('client.released');
        },
      };
    },
    async end() {
      statements.push('pool.closed');
    },
  };
  try {
    await assert.rejects(runMigrations(pool, directory), /Fixture migration failed/);
    assert.ok(statements.includes('BEGIN'));
    assert.ok(statements.some((sql) => sql.includes('pg_advisory_xact_lock')));
    assert.deepEqual(statements.slice(-3), ['ROLLBACK', 'client.released', 'pool.closed']);
    assert.equal(statements.includes('COMMIT'), false);
    assert.equal(
      statements.some((sql) => sql.startsWith('INSERT INTO schema_migrations')),
      false
    );
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    assert.equal(manifest.scripts['db:migrate'], 'node scripts/migrate.mjs');
    const docker = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
    assert.match(
      docker,
      /COPY --from=builder \/app\/scripts\/migrate\.mjs \.\/scripts\/migrate\.mjs/
    );
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(basename(directory), /^clinic-migration-test-/);
    await rm(directory, { recursive: true, force: true });
  }
});
