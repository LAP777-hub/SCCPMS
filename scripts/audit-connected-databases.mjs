import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { emailSender, validResendKey } from '../server/scripts/check-email.mjs';
const require = createRequire(resolve('server/package.json'));
require('dotenv').config({ path: resolve('server/.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const profiles = await auth.from('profiles').select('*');
console.log('Supabase profile schema:', profiles.error ? profiles.error.message : 'ready');
if (profiles.data) {
  console.log('Profile counts:', profiles.data.reduce((totals, row) => { totals[row.role] = (totals[row.role] || 0) + 1; return totals; }, {}));
  console.log('Profile columns:', Object.keys(profiles.data[0] || {}));
  console.log('Profiles missing OTP email:', profiles.data.filter(row => !row.email).length);
}
const users = await auth.auth.admin.listUsers({ perPage: 1000 });
console.log('Auth user count:', users.error ? 'unavailable' : users.data.users.length);
console.log('RESEND_API_KEY configured:', Boolean(process.env.RESEND_API_KEY?.trim()));
console.log('Full Resend API key format valid:', validResendKey(process.env.RESEND_API_KEY));
console.log('Primary sender configured:', Boolean(process.env.RESEND_FROM_EMAIL?.trim()));
console.log('Resend test sender:', emailSender(process.env.RESEND_FROM_EMAIL)?.testDomain ?? false);
console.log('Provider domain readiness: run npm run email:check --prefix server (GET only; no emails sent).');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL_MODE === 'verify-full' ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) } : undefined, connectionTimeoutMillis: 5000 });
try {
  console.log('Database host:', new URL(process.env.DATABASE_URL).hostname);
  console.log('Database connection port:', new URL(process.env.DATABASE_URL).port || '5432');
  const authSchema = await pool.query("SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='auth' AND tablename='users') AS available");
  console.log('Connected database has Supabase Auth:', authSchema.rows[0].available);
  const dbProfiles = await pool.query('SELECT id FROM public.profiles');
  console.log('Database profile IDs match Supabase:', !!profiles.data && JSON.stringify(dbProfiles.rows.map(row => row.id).sort()) === JSON.stringify(profiles.data.map(row => row.id).sort()));
  const fixtures = await pool.query("SELECT (SELECT count(*) FROM public.clinic_doctors WHERE full_name IN ('Fixture Doctor','Second Fixture Doctor')) AS doctors, (SELECT count(*) FROM public.appointments WHERE reason='Fixture appointment') AS appointments");
  console.log('Production test fixture rows:', fixtures.rows[0]);
  const permissions = await pool.query("SELECT has_table_privilege('authenticated','public.appointments','SELECT') AS direct_clinical_read, has_table_privilege('authenticated','public.profiles','UPDATE') AS direct_role_edit, has_table_privilege('anon','public.profiles','SELECT') AS anonymous_profile_read");
  console.log('Browser bypass permissions (must all be false):', permissions.rows[0]);
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log('Clinical tables:', tables.rows.map(row => row.tablename));
  const migrations = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  console.log('Applied migrations:', migrations.rows.map(row => row.version));
} catch (error) { console.log('Clinical database audit:', error.message); }
finally { await pool.end(); }
