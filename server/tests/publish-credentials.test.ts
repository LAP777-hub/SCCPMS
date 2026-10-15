import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error Administrative Node helper intentionally has no TS declaration.
import { privateCredentialReferences, scanText } from '../../scripts/check-publish-secrets.mjs';

test('publication guard rejects raw and encoded Brevo credentials without echoing them', () => {
  for (const prefix of ['xkeysib-', 'xsmtpsib-']) {
    const secret = prefix + 'a'.repeat(64) + '-' + 'B'.repeat(16);
    const encoded = Buffer.from(JSON.stringify({ api_key: secret })).toString('base64');
    for (const value of [secret, encoded]) {
      const findings = scanText('configuration.md', `Example\n${value}\n`);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].line, 2);
      assert.match(findings[0].type, /Brevo/);
      assert.ok(!JSON.stringify(findings).includes(value));
    }
  }
});

test('publication guard includes active Brevo API and SMTP keys in exact comparisons', () => {
  const api = 'private-api-' + 'C'.repeat(40);
  const smtp = 'private-smtp-' + 'D'.repeat(40);
  const references = privateCredentialReferences([
    ['BREVO_API_KEY', api], ['BREVO_SMTP_PASSWORD', smtp],
    ['VITE_PUBLIC_LABEL', 'public clinic name'],
  ]);
  assert.ok(references.has(api));
  assert.ok(references.has(smtp));
  assert.equal(scanText('readme.md', `${api}\n${smtp}`, references).length, 2);
  assert.equal(references.has('public clinic name'), false);
});

test('publication guard permits documented Brevo placeholders and ordinary base64 data', () => {
  const fixture = 'xkeysib-test_' + 'a'.repeat(64);
  const encoded = Buffer.from(JSON.stringify({ api_key: fixture })).toString('base64');
  assert.deepEqual(scanText('server/.env.example', `${fixture}\n${encoded}`), []);
  const plainData = Buffer.from(JSON.stringify({ image_label: 'ordinary public asset metadata' })).toString('base64');
  assert.deepEqual(scanText('readme.md', plainData), []);
});
