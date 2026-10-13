import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error Standalone operational runner is native JavaScript.
import { configureAuthRedirects, inspectAuthRedirects } from '../scripts/auth-redirect-settings.mjs';

const settings = { supabaseUrl: 'https://fixture.supabase.co', frontendOrigin: 'http://localhost:5173', managementToken: 'fixture-management-token' };

test('hosted URL repair preserves existing allowed URLs and changes only redirect settings', async () => {
  let current = { site_url: 'http://localhost:3000', uri_allow_list: 'https://existing.example/app', smtp_pass: 'must-never-be-returned' };
  const writes: Record<string, string>[] = [];
  const provider = async (_input: unknown, init: RequestInit) => {
    if (init.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      writes.push(body); current = { ...current, ...body };
    }
    return Response.json(current);
  };
  const summary = await configureAuthRedirects(settings, provider);
  assert.equal(summary.changed, true);
  assert.equal(summary.siteUrl, settings.frontendOrigin);
  assert.equal(summary.existingRedirectsPreserved, true);
  assert.deepEqual(Object.keys(writes[0]).sort(), ['site_url', 'uri_allow_list']);
  assert.ok(writes[0].uri_allow_list.includes('https://existing.example/app'));
  assert.ok(writes[0].uri_allow_list.includes('/?auth_action=invite'));
  assert.equal(JSON.stringify(summary).includes('must-never-be-returned'), false);
  const again = await configureAuthRedirects(settings, provider);
  assert.equal(again.changed, false);
  assert.equal(writes.length, 1);
});

test('missing management credentials cannot attempt a hosted settings mutation', async () => {
  let requests = 0;
  await assert.rejects(configureAuthRedirects({ ...settings, managementToken: '' }, async () => { requests++; return Response.json({}); }), /SUPABASE_ACCESS_TOKEN/);
  assert.equal(requests, 0);
});

test('safe redirect probes distinguish the wrong project default from accepted callbacks', async () => {
  const methods: string[] = [];
  const result = await inspectAuthRedirects(settings, async (input: URL, init: RequestInit) => {
    methods.push(init.method ?? 'GET');
    assert.equal(input.searchParams.get('token'), 'sccpms-invalid-token-redirect-check');
    const redirect = input.searchParams.get('redirect_to') ?? 'http://localhost:3000';
    return new Response(null, { status: 303, headers: { location: `${redirect}#error=access_denied` } });
  });
  assert.equal(result.ok, false);
  assert.equal(result.probes[0].destinationOrigin, 'http://localhost:3000');
  assert.ok(result.probes.slice(1).every((probe: { accepted: boolean }) => probe.accepted));
  assert.deepEqual(methods, ['GET', 'GET', 'GET', 'GET']);
});
