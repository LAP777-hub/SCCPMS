import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, configSchema } from '../src/config.js';

const production = { ...config, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://clinic.example.invalid', DATABASE_SSL_MODE: 'verify-full', RESEND_API_KEY: 're_test_fixture_only_0123456789', RESEND_FROM_EMAIL: 'SCCPMS Clinic <clinic@notifications.sccpms-fixture.co.za>' };
test('production accepts Resend credentials, a custom-domain sender, exact HTTPS origin and certificate-verified database', () => {
  assert.equal(configSchema.safeParse(production).success, true);
});
for (const [name, changes] of [
  ['missing Resend API key', { RESEND_API_KEY: '' }],
  ['invalid Resend API key prefix', { RESEND_API_KEY: 'test_fixture_only' }],
  ['missing email sender', { RESEND_FROM_EMAIL: '' }],
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
