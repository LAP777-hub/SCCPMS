import { readFileSync } from 'node:fs';

type DatabaseSettings = { DATABASE_URL: string; DATABASE_SSL_MODE?: string; DATABASE_SSL_CA?: string };

export function databaseOptions(settings: DatabaseSettings, connectionString = settings.DATABASE_URL) {
  const url = new URL(connectionString);
  // pg URL SSL parameters otherwise override the explicitly validated TLS policy.
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  const supabase = url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname);
  const ca = settings.DATABASE_SSL_CA?.replace(/\\n/g, '\n')
    || (settings.DATABASE_SSL_MODE === 'verify-full' && supabase
      ? readFileSync(new URL('../certs/prod-ca-2021.crt', import.meta.url), 'utf8') : undefined);
  return { connectionString: url.href,
    ssl: settings.DATABASE_SSL_MODE === 'verify-full' ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined };
}
