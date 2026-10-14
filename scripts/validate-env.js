import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { developmentEmailSender, emailSender, validResendKey } from '../server/scripts/check-email.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(resolve(projectRoot, 'server/package.json'));
const parse = require('dotenv').parse;
const read = file => existsSync(file) ? parse(readFileSync(file)) : {};
const backend = { ...read(resolve(projectRoot, 'server/.env')), ...process.env };
const frontend = { ...read(resolve(projectRoot, '.env')), ...process.env };
let valid = true;
const check = (key, value, test = Boolean) => {
  const passes = test(value);
  console.log(`${key}: ${passes ? 'valid' : 'missing or invalid'}`);
  valid &&= passes;
};
const url = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
check('SUPABASE_URL', backend.SUPABASE_URL, url);
check('FRONTEND_ORIGIN', backend.FRONTEND_ORIGIN, value => {
  try { return url(value) && new URL(value).origin === value; } catch { return false; }
});
for (const key of ['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']) check(key, backend[key]);
check('RESEND_API_KEY', backend.RESEND_API_KEY, validResendKey);
if (!validResendKey(backend.RESEND_API_KEY))
  console.log('Email OTP delivery unavailable until a full Resend key is added; development startup can still run.');
const sender = backend.RESEND_FROM_EMAIL || developmentEmailSender;
check('RESEND_FROM_EMAIL', sender, value => Boolean(emailSender(value)));
check('OTP_HMAC_SECRET', backend.OTP_HMAC_SECRET, value => typeof value === 'string' && value.length >= 32);
check('DATABASE_URL', backend.DATABASE_URL, value => /^postgres(ql)?:\/\//.test(value || ''));
check('PORT', backend.PORT || '4000', value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 65536);
for (const key of ['VITE_SUPABASE_URL','VITE_API_URL']) check(key, frontend[key], url);
check('VITE_SUPABASE_ANON_KEY', frontend.VITE_SUPABASE_ANON_KEY);
check('Matching Supabase projects', frontend.VITE_SUPABASE_URL === backend.SUPABASE_URL);
if (backend.NODE_ENV === 'production') {
  check('DATABASE_SSL_MODE', backend.DATABASE_SSL_MODE, value => value === 'verify-full');
  check('Custom Resend sender', sender, value => Boolean(emailSender(value)) && !emailSender(value).testDomain && !emailSender(value).reservedDomain);
  check('HTTPS frontend origin', backend.FRONTEND_ORIGIN, value => value?.startsWith('https://'));
}
console.log('Verify sender-domain status separately with npm run email:check --prefix server; configuration syntax does not establish delivery.');
process.exitCode = valid ? 0 : 1;
