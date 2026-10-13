import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseOptions } from '../src/database-ssl.js';

test('Supabase transaction URLs keep certificate verification and use the bundled CA', () => {
  const settings = { DATABASE_URL: 'postgresql://fixture:password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=no-verify', DATABASE_SSL_MODE: 'verify-full' };
  const result = databaseOptions(settings);
  assert.equal(new URL(result.connectionString).searchParams.has('sslmode'), false);
  assert.equal(result.ssl?.rejectUnauthorized, true);
  assert.match(result.ssl?.ca ?? '', /-----BEGIN CERTIFICATE-----/);
});

test('an explicit CA overrides the bundled certificate and URL TLS parameters cannot weaken it', () => {
  const result = databaseOptions({ DATABASE_URL: 'postgresql://fixture:password@example.invalid/database?sslmode=disable&sslrootcert=wrong&sslcert=wrong&sslkey=wrong&application_name=clinic', DATABASE_SSL_MODE: 'verify-full', DATABASE_SSL_CA: 'fixture\\ncertificate' });
  assert.deepEqual(result.ssl, { rejectUnauthorized: true, ca: 'fixture\ncertificate' });
  assert.equal(new URL(result.connectionString).search, '?application_name=clinic');
});

test('local non-TLS test databases and publicly trusted custom database hosts retain their configured policy', () => {
  assert.equal(databaseOptions({ DATABASE_URL: 'postgresql://fixture:password@localhost/test', DATABASE_SSL_MODE: 'disable' }).ssl, undefined);
  assert.deepEqual(databaseOptions({ DATABASE_URL: 'postgresql://fixture:password@example.invalid/test', DATABASE_SSL_MODE: 'verify-full' }).ssl, { rejectUnauthorized: true });
});
