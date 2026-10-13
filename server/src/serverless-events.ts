import type { Request, Response } from 'express';
import { pool } from './db.js';
import { requireAuth, requireOtp } from './auth.js';

export type ClinicRevisionMap = Map<string, string>;
type AccessResult = { ok: boolean; status: number; code?: string };
type StreamOptions = {
  durationMs?: number;
  pollMs?: number;
  recheckMs?: number;
  validate?: (req: Request) => Promise<AccessResult>;
};

/** The snapshot floor includes transactions that started before this stream
 * but have not committed. A sequence high-water mark would skip those commits. */
export function createClinicRevisionReader() {
  let floor: string | undefined;
  return async (): Promise<ClinicRevisionMap> => {
    if (floor === undefined) {
      const snapshot = await pool.query<{ floor: string }>(
        'SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS floor'
      );
      floor = snapshot.rows[0].floor;
    }
    const result = await pool.query<{ table_name: string; revision: string }>(
      `SELECT table_name, count(*)::text || ':' ||
         md5(string_agg(event_id::text, ',' ORDER BY event_id)) AS revision
       FROM clinic_change_events WHERE transaction_id >= $1::xid8 GROUP BY table_name`,
      [floor]
    );
    return new Map(result.rows.map((row) => [row.table_name, row.revision]));
  };
}

export async function recheckClinicEventAccess(req: Request): Promise<AccessResult> {
  // Middleware caches apply to one HTTP request; they must not authorize the
  // whole live stream after a logout, role change or administrator suspension.
  req.auth = undefined;
  req.otpValidated = undefined;
  let status = 200,
    code: string | undefined,
    authenticated = false,
    otp = false;
  const probe = {
    status(value: number) {
      status = value;
      return probe;
    },
    json(value: { code?: string }) {
      code = value.code;
      return probe;
    },
  } as unknown as Response;
  await requireAuth(req, probe, () => {
    authenticated = true;
  });
  if (authenticated)
    await requireOtp(req, probe, () => {
      otp = true;
    });
  return { ok: authenticated && otp, status, ...(code ? { code } : {}) };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stopped = () => reject(new Error('Stream closed'));
    if (signal.aborted) {
      promise.catch(() => undefined);
      stopped();
      return;
    }
    signal.addEventListener('abort', stopped, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stopped));
  });
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

/** One bounded invocation owns its stream and leases database access per query.
 * It never depends on a process-local LISTEN socket or another function instance. */
export async function serveServerlessClinicEvents(
  req: Request,
  res: Response,
  readVersions = createClinicRevisionReader(),
  options: StreamOptions = {}
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const identity = req.auth ? { ...req.auth } : undefined;
  const validate = options.validate ?? recheckClinicEventAccess;
  const deadline = setTimeout(() => {
    stop();
    if (!res.writableEnded) res.end();
  }, options.durationMs ?? 50_000);
  req.on('aborted', stop);
  res.on('close', stop);
  let opened = false;
  const emit = (event: string | undefined, payload: object) => {
    if (controller.signal.aborted || res.writableEnded) return;
    res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`);
  };
  try {
    let previous = await abortable(readVersions(), controller.signal);
    if (controller.signal.aborted) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    opened = true;
    res.write(': connected\n\n');
    let checkedAt = Date.now();
    while (!controller.signal.aborted) {
      await pause(options.pollMs ?? 2_000, controller.signal);
      if (controller.signal.aborted) break;
      if (Date.now() - checkedAt >= (options.recheckMs ?? 15_000)) {
        const access = await abortable(validate(req), controller.signal);
        checkedAt = Date.now();
        if (!access.ok) {
          emit(access.status === 503 || access.status === 429 ? 'sync-error' : 'auth-error', {
            code: access.code,
          });
          break;
        }
        if (
          !identity ||
          req.auth?.userId !== identity.userId ||
          req.auth?.sessionId !== identity.sessionId
        ) {
          emit('auth-error', { code: 'SESSION_INVALID' });
          break;
        }
        if (req.auth.role !== identity.role) {
          emit(undefined, { changed: true, table: 'profiles' });
          break;
        }
        res.write(': heartbeat\n\n');
      }
      const current = await abortable(readVersions(), controller.signal);
      for (const table of new Set([...previous.keys(), ...current.keys()])) {
        if (previous.get(table) !== current.get(table)) emit(undefined, { changed: true, table });
      }
      previous = current;
    }
  } catch {
    if (!controller.signal.aborted) {
      if (!opened)
        res.status(503).json({ error: 'Live synchronization is temporarily unavailable.' });
      else emit('sync-error', { code: 'SYNC_UNAVAILABLE' });
    }
  } finally {
    stop();
    clearTimeout(deadline);
    req.removeListener('aborted', stop);
    res.removeListener('close', stop);
    if (opened && !res.writableEnded) res.end();
  }
}
