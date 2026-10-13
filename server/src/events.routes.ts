import { Router, type Response } from 'express';
import type { PoolClient } from 'pg';
import pg from 'pg';
import { config } from './config.js';
import { requireAuth, requireOtp } from './auth.js';
import { serveServerlessClinicEvents } from './serverless-events.js';
import { databaseOptions } from './database-ssl.js';

const router = Router();
const subscribers = new Set<Response>();
let listener: Promise<PoolClient> | null = null;
let stopping = false;
let releaseListener: (() => void) | null = null;
let shutdown: Promise<void> | null = null;

const eventsUrl = new URL(config.DATABASE_EVENTS_URL || config.DATABASE_URL);
// LISTEN requires a session connection; Supabase transaction poolers use 6543.
if (!config.DATABASE_EVENTS_URL && eventsUrl.hostname.endsWith('.pooler.supabase.com') && eventsUrl.port === '6543') eventsUrl.port = '5432';
const eventsPool = new pg.Pool({
  ...databaseOptions(config, eventsUrl.toString()), max: 1, connectionTimeoutMillis: 10000,
});

function connectListener() {
  if (!listener) listener = eventsPool.connect().then(async client => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      client.release(true);
    };
    releaseListener = release;
    client.on('notification', event => {
      // Only invalidation is broadcast; each role reloads its authorized API views.
      const payload = JSON.stringify({ changed: true, table: event.payload });
      for (const response of subscribers) response.write(`data: ${payload}\n\n`);
    });
    client.on('error', () => {
      listener = null;
      for (const response of subscribers) response.end();
      subscribers.clear();
      release();
    });
    try { await client.query('LISTEN clinic_changes'); }
    catch (error) { release(); throw error; }
    return client;
  }).catch(error => { listener = null; throw error; });
  return listener;
}

export function closeClinicEvents(): Promise<void> {
  if (shutdown) return shutdown;
  stopping = true;
  for (const response of subscribers) response.end();
  subscribers.clear();
  shutdown = (async () => {
    // An in-flight connection must finish before its client is released.
    await listener?.catch(() => undefined);
    releaseListener?.();
    listener = null;
    await eventsPool.end();
  })();
  return shutdown;
}

router.get('/', (req, res, next) => {
  res.locals.clinicEventsStartedAt = Date.now();
  next();
}, requireAuth, requireOtp, async (req, res) => {
  if (stopping) return res.status(503).json({ error: 'The server is shutting down.' });
  if (process.env.VERCEL === '1') return serveServerlessClinicEvents(req, res, undefined, {
    durationMs: Math.max(0, 50_000 - (Date.now() - (res.locals?.clinicEventsStartedAt ?? Date.now()))),
  });
  try { await connectListener(); }
  catch { return res.status(503).json({ error: 'Live synchronization is temporarily unavailable.' }); }
  if (stopping) return res.status(503).json({ error: 'The server is shutting down.' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');
  subscribers.add(res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  // Reconnect with a refreshed access token and recheck OTP/account permissions.
  const expires = setTimeout(() => res.end(), 60000);
  const cleanup = () => { clearInterval(heartbeat); clearTimeout(expires); subscribers.delete(res); };
  req.on('close', cleanup);
  res.on('close', cleanup);
});

export default router;
