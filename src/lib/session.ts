import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

let requestVersion = 0;
export const sessionRequestVersion = () => requestVersion;
export function invalidateSessionRequests() { requestVersion += 1; }

export class SessionUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'AUTH_UNAVAILABLE';
  constructor() { super('Unable to renew your session right now. Check your connection and try again.'); }
}

function sessionId(session: Session): string | null {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { session_id?: unknown };
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch { return null; }
}

export function sameAuthSession(first: Session | null, second: Session | null): boolean {
  if (!first || !second || first.user.id !== second.user.id) return false;
  const id = sessionId(first);
  return id ? id === sessionId(second) : first.access_token === second.access_token;
}

export async function currentAuthSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  // A refresh outage can return a null session while retaining stored credentials.
  // Do not turn that temporary error into an anonymous API request or a logout.
  if (error) throw new SessionUnavailableError();
  return data.session;
}

let recovery: { session: Session; version: number; promise: Promise<Session | null> } | null = null;

export async function refreshRejectedSession(rejected: Session): Promise<Session | null> {
  const version = sessionRequestVersion();
  const current = await currentAuthSession();
  if (version !== sessionRequestVersion() || !sameAuthSession(rejected, current)) return null;
  // Another request or the SDK may have already renewed the rejected token.
  if (current!.access_token !== rejected.access_token) return current;
  if (recovery && recovery.version === version && sameAuthSession(rejected, recovery.session)) return recovery.promise;

  const attempt = {
    session: rejected,
    version,
    promise: (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw new SessionUnavailableError();
      const latest = await currentAuthSession();
      // An old request must never run under a later login or another account.
      return version === sessionRequestVersion() && sameAuthSession(rejected, data.session) && sameAuthSession(rejected, latest) ? latest : null;
    })(),
  };
  recovery = attempt;
  try { return await attempt.promise; }
  finally { if (recovery === attempt) recovery = null; }
}
