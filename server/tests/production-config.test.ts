import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, configSchema } from '../src/config.js';

const production = { ...config, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://clinic.example.invalid', DATABASE_SSL_MODE: 'verify-full', RESEND_API_KEY: 're_test_fixture_only_0123456789', RESEND_FROM_EMAIL: 'SCCPMS Clinic <clinic@notifications.sccpms-fixture.co.za>', RESEND_ADMIN_OWNER_EMAIL: 'admin.owner.fixture@gmail.com', RESEND_ADMIN_OWNER_USER_ID: '00000000-0000-4000-8000-000000000081', BREVO_API_KEY: '', BREVO_FROM_EMAIL: '' };

test('login codes have exactly five minutes of validity by default and in configured deployments', () => {
  const defaults = configSchema.parse({ ...production, OTP_VALIDITY_SECONDS: undefined });
  assert.equal(defaults.OTP_VALIDITY_SECONDS, 300);
  assert.equal(configSchema.parse({ ...production, OTP_VALIDITY_SECONDS: '300' }).OTP_VALIDITY_SECONDS, 300);
  for (const seconds of [0, 120, 299, 301, 600, 900]) {
    assert.equal(configSchema.safeParse({ ...production, OTP_VALIDITY_SECONDS: seconds }).success, false);
  }
});
test('a legacy Resend sender alone cannot enable general production delivery', () => {
  assert.equal(configSchema.safeParse({ ...production, RESEND_ADMIN_OWNER_EMAIL: '', RESEND_ADMIN_OWNER_USER_ID: '' }).success, false);
});

test('owner-only delivery requires a complete valid account binding and cannot make the global test sender a production sender', () => {
  const owner = { RESEND_ADMIN_OWNER_EMAIL: 'admin.owner.fixture@gmail.com', RESEND_ADMIN_OWNER_USER_ID: '00000000-0000-4000-8000-000000000081' };
  assert.equal(configSchema.safeParse({ ...production, ...owner }).success, true);
  for (const changes of [
    { ...owner, RESEND_ADMIN_OWNER_EMAIL: '' }, { ...owner, RESEND_ADMIN_OWNER_USER_ID: '' },
    { ...owner, RESEND_ADMIN_OWNER_EMAIL: 'invalid-address' }, { ...owner, RESEND_ADMIN_OWNER_USER_ID: 'not-a-uuid' },
    { ...owner, RESEND_FROM_EMAIL: 'SCCPMS <onboarding@resend.dev>' },
  ]) assert.equal(configSchema.safeParse({ ...production, ...changes }).success, false);
});

test('an absent primary sender permits only the explicitly configured owner bootstrap', () => {
  const owner = { RESEND_ADMIN_OWNER_EMAIL: 'admin.owner.fixture@gmail.com', RESEND_ADMIN_OWNER_USER_ID: '00000000-0000-4000-8000-000000000081' };
  for (const RESEND_FROM_EMAIL of ['', '   ', undefined]) {
    const parsed = configSchema.safeParse({ ...production, ...owner, RESEND_FROM_EMAIL });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.RESEND_FROM_EMAIL, '');
    for (const incomplete of [
      { RESEND_ADMIN_OWNER_EMAIL: '', RESEND_ADMIN_OWNER_USER_ID: '' },
      { ...owner, RESEND_ADMIN_OWNER_EMAIL: '' },
      { ...owner, RESEND_ADMIN_OWNER_USER_ID: '' },
      { ...owner, RESEND_ADMIN_OWNER_USER_ID: 'not-a-uuid' },
      { ...owner, RESEND_ADMIN_OWNER_EMAIL: 'invalid-address' },
    ]) assert.equal(configSchema.safeParse({ ...production, ...incomplete, RESEND_FROM_EMAIL }).success, false);
  }
  assert.equal(configSchema.safeParse({ ...production, ...owner, RESEND_FROM_EMAIL: '', RESEND_API_KEY: '' }).success, false);
  assert.equal(configSchema.safeParse({ ...production, ...owner, RESEND_FROM_EMAIL: '', DATABASE_SSL_MODE: 'disable' }).success, false);
});
for (const [name, changes] of [
  ['missing Resend API key', { RESEND_API_KEY: '' }],
  ['invalid Resend API key prefix', { RESEND_API_KEY: 'test_fixture_only' }],
  ['Resend test-domain sender', { RESEND_FROM_EMAIL: 'onboarding@resend.dev' }],
  ['Resend test-domain display sender', { RESEND_FROM_EMAIL: 'SCCPMS Clinic <onboarding@resend.dev>' }],
  ['Resend test subdomain sender', { RESEND_FROM_EMAIL: 'clinic@sub.resend.dev' }],
  ['reserved invalid domain sender', { RESEND_FROM_EMAIL: 'clinic@notifications.example.invalid' }],
  ['reserved example domain sender', { RESEND_FROM_EMAIL: 'clinic@notifications.example' }],
  ['reserved test domain sender', { RESEND_FROM_EMAIL: 'clinic@notifications.test' }],
  ['sender header injection', { RESEND_FROM_EMAIL: 'SCCPMS <clinic@spu.ac.za>\r\nBcc: attacker@spu.ac.za' }],
  ['malformed email sender', { RESEND_FROM_EMAIL: 'clinic-without-address' }],
  ['HTTP origin', { FRONTEND_ORIGIN: 'http://clinic.example.invalid' }],
  ['origin with path', { FRONTEND_ORIGIN: 'https://clinic.example.invalid/login' }],
  ['origin with query', { FRONTEND_ORIGIN: 'https://clinic.example.invalid?redirect=elsewhere' }],
  ['origin with credentials', { FRONTEND_ORIGIN: 'https://user:password@clinic.example.invalid' }],
  ['origin with trailing slash', { FRONTEND_ORIGIN: 'https://clinic.example.invalid/' }],
  ['disabled database TLS', { DATABASE_SSL_MODE: 'disable' }],
  ['unspecified database TLS', { DATABASE_SSL_MODE: undefined }],
] as const) test(`production refuses ${name}`, () => {
  assert.equal(configSchema.safeParse({ ...production, ...changes }).success, false);
});
