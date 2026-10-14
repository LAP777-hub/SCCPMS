import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
// Administrative readiness checks run as plain Node scripts.
// @ts-expect-error The existing .mjs helper has no TypeScript declaration.
import { checkEmailConfiguration } from '../scripts/check-email.mjs';

test('an absent primary sender cannot report ready or fall back to the provider test domain', async () => {
  const fetcher = mock.fn(async () => { throw new Error('No domain lookup is needed without a sender'); });
  for (const production of [false, true]) {
    for (const fromEmail of ['', '   ', undefined]) {
      const result = await checkEmailConfiguration({ production, fromEmail, apiKey: 're_readiness_fixture_only_0123456789' }, fetcher);
      assert.equal(result.ok, false);
      assert.equal(result.senderValid, false);
      assert.equal(result.testSender, false);
      assert.equal(result.reason, 'configuration');
      assert.equal(result.domainAccess, 'not_checked');
    }
  }
  assert.equal(fetcher.mock.calls.length, 0);
});
