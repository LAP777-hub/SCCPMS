import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const actions = ['signup', 'invite', 'recovery'];

function frontendOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error('Set FRONTEND_ORIGIN to the application HTTP(S) origin without a path or trailing slash.');
  return url.origin;
}

export function requiredAuthRedirects(origin) {
  const base = frontendOrigin(origin);
  return [base, `${base}/`, ...actions.map(action => `${base}/?auth_action=${action}`)];
}

function managementEndpoint(supabaseUrl) {
  const url = new URL(supabaseUrl);
  const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match || url.protocol !== 'https:') throw new Error('A hosted Supabase project URL is required to configure its Auth settings.');
  return `https://api.supabase.com/v1/projects/${match[1]}/config/auth`;
}

async function readManagedConfig(settings, fetcher) {
  if (!settings.managementToken?.trim()) throw new Error('Save SUPABASE_ACCESS_TOKEN in ignored server/.env. Application anon/service-role keys cannot edit hosted Auth URL settings.');
  const response = await fetcher(managementEndpoint(settings.supabaseUrl), {
    method: 'GET', headers: { Authorization: `Bearer ${settings.managementToken.trim()}`, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase management access rejected (HTTP ${response.status}). The token needs Auth configuration read/write access.`);
  const config = await response.json();
  if (typeof config?.site_url !== 'string' || typeof config?.uri_allow_list !== 'string') throw new Error('Supabase returned an unsupported Auth settings response.');
  return config;
}

export async function configureAuthRedirects(settings, fetcher = fetch) {
  const origin = frontendOrigin(settings.frontendOrigin);
  const required = requiredAuthRedirects(origin);
  const current = await readManagedConfig(settings, fetcher);
  // Retain existing deployment URLs; change only Site URL and redirect allow-list.
  const previous = current.uri_allow_list.split(',').map(value => value.trim()).filter(Boolean);
  const merged = [...new Set([...previous, ...required])];
  const desired = { site_url: origin, uri_allow_list: merged.join(',') };
  const changed = current.site_url !== desired.site_url || current.uri_allow_list !== desired.uri_allow_list;
  if (changed) {
    const response = await fetcher(managementEndpoint(settings.supabaseUrl), {
      method: 'PATCH', headers: { Authorization: `Bearer ${settings.managementToken.trim()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(desired), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Supabase could not update Auth URLs (HTTP ${response.status}).`);
  }
  const verified = await readManagedConfig(settings, fetcher);
  const savedUrls = verified.uri_allow_list.split(',').map(value => value.trim());
  if (verified.site_url !== origin || required.some(url => !savedUrls.includes(url))) throw new Error('Hosted Auth URL settings did not match after saving.');
  // Never return provider credentials, SMTP secrets or full management responses.
  return { changed, siteUrl: verified.site_url, requiredRedirects: required, existingRedirectsPreserved: previous.every(url => savedUrls.includes(url)) };
}

export async function inspectAuthRedirects(settings, fetcher = fetch) {
  const origin = frontendOrigin(settings.frontendOrigin);
  const probes = [];
  for (const action of [null, ...actions]) {
    const url = new URL('/auth/v1/verify', settings.supabaseUrl);
    // Deliberately invalid: no user account, email or real confirmation token is used.
    url.searchParams.set('token', 'sccpms-invalid-token-redirect-check');
    url.searchParams.set('type', action ?? 'signup');
    if (action) url.searchParams.set('redirect_to', `${origin}/?auth_action=${action}`);
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const location = response.headers.get('location');
    let destination = null;
    try { destination = location ? new URL(location) : null; } catch { /* Report unsupported redirect safely. */ }
    probes.push({ action: action ?? 'project-default', httpStatus: response.status,
      destinationOrigin: destination?.origin ?? null,
      accepted: Boolean(destination?.origin === origin && (!action || destination.searchParams.get('auth_action') === action)),
    });
  }
  return { ok: probes.every(probe => probe.accepted), frontendOrigin: origin, managementTokenConfigured: Boolean(settings.managementToken?.trim()), probes };
}

async function main() {
  const settings = { supabaseUrl: process.env.SUPABASE_URL, frontendOrigin: process.env.FRONTEND_ORIGIN,
    managementToken: process.env.SUPABASE_ACCESS_TOKEN };
  if (process.argv.includes('--apply')) console.log(JSON.stringify(await configureAuthRedirects(settings), null, 2));
  const summary = await inspectAuthRedirects(settings);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    console.log('Hosted Supabase Site URL/redirect configuration still needs correction. Local supabase/config.toml does not update the hosted project.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Do not print raw provider responses, tokens or transport exceptions.
    console.error(error instanceof Error && /^(Set FRONTEND_ORIGIN|Save SUPABASE_ACCESS_TOKEN|Supabase management|Supabase could not|Hosted Auth|A hosted Supabase|Supabase returned)/.test(error.message)
      ? error.message : 'Unable to check Auth redirects. Check configuration and connectivity.');
    process.exitCode = 1;
  });
}
