import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(resolve('server/package.json'));
require('dotenv').config({ path: resolve('server/.env'), quiet: true });
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL_MODE === 'verify-full' ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) } : undefined });
const api = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
try {
  const profiles = await api.from('profiles').select('id');
  if (profiles.error) throw new Error(profiles.error.message);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query('SELECT id FROM public.profiles ORDER BY id');
    if (JSON.stringify(rows.rows.map(row => row.id).sort()) !== JSON.stringify(profiles.data.map(row => row.id).sort())) throw new Error('Profile database does not match the connected Supabase project.');
    await client.query(readFileSync('supabase/migrations/20261012000000_restrict_profile_writes.sql', 'utf8'));
    await client.query('COMMIT');
    console.log('Applied read-only browser profile policies to the matching Supabase database.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} finally { await pool.end(); }
