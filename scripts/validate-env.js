import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { emailSender, validResendKey } from '../server/scripts/check-email.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(resolve(projectRoot, 'server/package.json'));
const parse = require('dotenv').parse;
const { z } = require('zod');
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
const sender = backend.RESEND_FROM_EMAIL?.trim() || '';
const ownerConfigured = z.string().trim().email().max(254).safeParse(backend.RESEND_ADMIN_OWNER_EMAIL).success
  && z.string().uuid().safeParse(backend.RESEND_ADMIN_OWNER_USER_ID).success;
const ownerMentioned = Boolean(backend.RESEND_ADMIN_OWNER_EMAIL || backend.RESEND_ADMIN_OWNER_USER_ID);
if (ownerMentioned) check('Complete owner-only administrator binding', ownerConfigured);
if (ownerMentioned || backend.RESEND_API_KEY) check('RESEND_API_KEY', backend.RESEND_API_KEY, validResendKey);
check('RESEND_FROM_EMAIL', sender, value => !value || Boolean(emailSender(value)) && (backend.NODE_ENV !== 'production' || !emailSender(value).testDomain && !emailSender(value).reservedDomain));
console.log('Resend is restricted to the configured administrator UUID and email; its legacy primary sender does not enable other users.');
const brevoKeyValid = typeof backend.BREVO_API_KEY === 'string' && /^xkeysib-[A-Za-z0-9_-]{32,}$/.test(backend.BREVO_API_KEY.trim());
const brevoSender = emailSender(backend.BREVO_FROM_EMAIL);
const brevoSenderValid = Boolean(brevoSender && !brevoSender.testDomain && !brevoSender.reservedDomain);
if (backend.BREVO_API_KEY || backend.BREVO_FROM_EMAIL) {
  check('BREVO_API_KEY', brevoKeyValid);
  check('BREVO_FROM_EMAIL', brevoSenderValid);
}
if (!brevoKeyValid || !brevoSenderValid) console.log('Non-admin OTP delivery is unavailable until Brevo has a full API key and a verified sender.');
check('OTP_HMAC_SECRET', backend.OTP_HMAC_SECRET, value => typeof value === 'string' && value.length >= 32);
check('DATABASE_URL', backend.DATABASE_URL, value => /^postgres(ql)?:\/\//.test(value || ''));
check('PORT', backend.PORT || '4000', value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 65536);
for (const key of ['VITE_SUPABASE_URL','VITE_API_URL']) check(key, frontend[key], url);
check('VITE_SUPABASE_ANON_KEY', frontend.VITE_SUPABASE_ANON_KEY);
check('Matching Supabase projects', frontend.VITE_SUPABASE_URL === backend.SUPABASE_URL);
if (backend.NODE_ENV === 'production') {
  check('DATABASE_SSL_MODE', backend.DATABASE_SSL_MODE, value => value === 'verify-full');
  check('Bound administrator or Brevo delivery configuration', ownerConfigured && validResendKey(backend.RESEND_API_KEY) || brevoKeyValid && brevoSenderValid);
  check('HTTPS frontend origin', backend.FRONTEND_ORIGIN, value => value?.startsWith('https://'));
}
console.log('Check Brevo sender, relay and Supabase SMTP with npm run auth:configure-brevo --prefix server -- --inspect; syntax does not establish inbox delivery.');
process.exitCode = valid ? 0 : 1;
