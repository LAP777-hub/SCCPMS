import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

export async function runMigrations(
  pool,
  sqlDirectory = fileURLToPath(new URL('../sql/', import.meta.url))
) {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(sqlDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const alreadyApplied = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [file]
      );
      if (alreadyApplied.rowCount) continue;
      const migration = await readFile(resolve(sqlDirectory, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('sccpms:migrations'))");
        const appliedWhileWaiting = await client.query(
          'SELECT 1 FROM schema_migrations WHERE version=$1',
          [file]
        );
        if (appliedWhileWaiting.rowCount) {
          await client.query('ROLLBACK');
          continue;
        }
        await client.query(migration);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied sql/${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL before running database migrations.');
  const sslMode = process.env.DATABASE_SSL_MODE;
  const connection = new URL(databaseUrl);
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) connection.searchParams.delete(name);
  const supabase = connection.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(connection.hostname);
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n')
    || (sslMode === 'verify-full' && supabase ? await readFile(new URL('../certs/prod-ca-2021.crt', import.meta.url), 'utf8') : undefined);
  if (process.env.NODE_ENV === 'production' && sslMode !== 'verify-full') {
    throw new Error(
      'Production migrations require DATABASE_SSL_MODE=verify-full for the Supabase database.'
    );
  }
  await runMigrations(
    new pg.Pool({
      connectionString: connection.href,
      ssl:
        sslMode === 'verify-full'
          ? {
              rejectUnauthorized: true,
              ...(ca ? { ca } : {}),
            }
          : undefined,
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      'Database migration failed. The current migration is rolled back; previously applied migrations remain.',
      typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? `SQLSTATE ${error.code}` : 'Check configuration and database connectivity.'
    );
    process.exitCode = 1;
  });
}
