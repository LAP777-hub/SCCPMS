import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('server/package.json'));
require('dotenv').config({ path: resolve('server/.env'), quiet: true });
const { Client, Pool } = require('pg');
const target = new URL(process.env.DATABASE_EVENTS_URL || process.env.DATABASE_URL);
if (!process.env.DATABASE_EVENTS_URL && target.hostname.endsWith('.pooler.supabase.com') && target.port === '6543') target.port = '5432';
const ssl = process.env.DATABASE_SSL_MODE === 'verify-full' ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) } : undefined;
const listener = new Client({ connectionString: target.toString(), ssl, connectionTimeoutMillis: 10000 });
const sender = new Pool({ connectionString: process.env.DATABASE_URL, ssl, connectionTimeoutMillis: 10000 });
try {
  await listener.connect();
  await listener.query('LISTEN clinic_sync_check');
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Live database notifications were not received.')), 5000);
    listener.once('notification', () => { clearTimeout(timer); resolve(); });
  });
  await sender.query("SELECT pg_notify('clinic_sync_check', 'connection-test')");
  await received;
  console.log('Live synchronization verified through the session connection.');
} finally { await listener.end(); await sender.end(); }
