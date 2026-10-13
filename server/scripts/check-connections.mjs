import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import dotenv from 'dotenv';
import pg from 'pg';

// Read configuration without printing credentials or touching account data.
const root = new URL('../../', import.meta.url);
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
let browser = {};
try { browser = dotenv.parse(readFileSync(new URL('.env', root))); } catch { /* API checks can still run. */ }

function tcpCheck(host, port) {
  return new Promise(resolve => {
    const start = Date.now();
    const socket = net.connect({ host, port });
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ ...result, elapsedMs: Date.now() - start });
    };
    socket.setTimeout(4000);
    socket.once('connect', () => finish({ reachable: true }));
    socket.once('timeout', () => finish({ reachable: false, code: 'ETIMEDOUT' }));
    socket.once('error', error => finish({ reachable: false, code: safeCode(error) }));
  });
}

function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'CONNECTION_FAILED';
}

async function httpCheck(label, url, options = {}, expectedStatus = 200) {
  const start = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    // Do not read identity responses, email payloads or credentials.
    let dependency;
    if (label === 'api-health') dependency = (await response.json().catch(() => null))?.dependency;
    const origin = options.headers?.Origin;
    return { label, method: options.method ?? 'GET', port: Number(new URL(url).port || (url.startsWith('https:') ? 443 : 80)),
      status: response.status, passed: response.status === expectedStatus, elapsedMs: Date.now() - start,
      ...(dependency ? { dependency } : {}),
      ...(origin ? { corsOriginMatches: response.headers.get('access-control-allow-origin') === origin } : {}),
      ...(options.method === 'OPTIONS' ? { allowedMethods: response.headers.get('access-control-allow-methods') } : {}) };
  } catch (error) {
    return { label, method: options.method ?? 'GET', passed: false, code: error.name === 'TimeoutError' ? 'ETIMEDOUT' : safeCode(error.cause ?? error), elapsedMs: Date.now() - start };
  }
}

async function main() {
  const origin = process.env.FRONTEND_ORIGIN;
  const api = (process.env.VITE_API_URL || browser.VITE_API_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  const database = new URL(process.env.DATABASE_URL);
  const events = new URL(process.env.DATABASE_EVENTS_URL || database.href);
  if (!process.env.DATABASE_EVENTS_URL && events.hostname.endsWith('.pooler.supabase.com') && events.port === '6543') events.port = '5432';
  const targets = [['database', database], ['database-events', events]];
  const transports = await Promise.all(targets.map(async ([label, url]) => ({ label, port: Number(url.port || 5432), ...await tcpCheck(url.hostname, Number(url.port || 5432)) })));
  const headers = { Origin: origin };
  const http = await Promise.all([
    httpCheck('frontend', origin),
    httpCheck('api-health', `${api}/healthz`, { headers }),
    httpCheck('profile-without-session', `${api}/auth/profile`, { headers }, 401),
    httpCheck('otp-status-without-session', `${api}/auth/otp/status`, { headers }, 401),
    httpCheck('otp-send-without-session', `${api}/auth/otp/send`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }, 401),
    httpCheck('otp-verify-without-session', `${api}/auth/otp/verify`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }, 401),
    httpCheck('otp-post-preflight', `${api}/auth/otp/send`, { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } }, 204),
    httpCheck('supabase-auth-https', `${process.env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: process.env.SUPABASE_ANON_KEY } }),
  ]);
  let sql = { passed: false, skipped: true, reason: 'Database TCP port is unreachable.' };
  if (transports[0].reachable) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000,
      ssl: process.env.DATABASE_SSL_MODE === 'verify-full' ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) } : undefined });
    try {
      await client.connect();
      const result = await client.query('SELECT 1 AS connection_check');
      sql = { passed: result.rows[0]?.connection_check === 1, skipped: false };
    } catch (error) { sql = { passed: false, skipped: false, code: safeCode(error) }; }
    finally { await client.end().catch(() => undefined); }
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), configuration: { frontendPort: Number(new URL(origin).port || 80), apiPort: Number(new URL(api).port || 80), apiPortMatchesServer: Number(new URL(api).port || 80) === Number(process.env.PORT || 4000), databaseTls: process.env.DATABASE_SSL_MODE ?? 'not configured' }, http, transports, sql }, null, 2));
  if (http.some(check => !check.passed || check.corsOriginMatches === false) || transports.some(check => !check.reachable) || !sql.passed) process.exitCode = 1;
}

main().catch(() => { console.error('Connection checks could not run. Verify the root .env and server/.env configuration.'); process.exitCode = 1; });
