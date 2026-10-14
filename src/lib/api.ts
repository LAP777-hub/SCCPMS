import type { Session } from '@supabase/supabase-js';
import { currentAuthSession, refreshRejectedSession, sameAuthSession, sessionRequestVersion } from './session';

const apiUrl = import.meta.env.VITE_API_URL;

export type OtpChallengeMetadata = { destination?: string; expiresAt?: string; expiresInSeconds?: number };
type OtpErrorMetadata = { retryAfterSeconds?: number; activeChallenge?: OtpChallengeMetadata | null };

export class ApiError extends Error {
  readonly retryAfterSeconds?: number;
  readonly activeChallenge?: OtpChallengeMetadata | null;
  constructor(message: string, public status: number, public code?: string, metadata: OtpErrorMetadata = {}) {
    super(message);
    this.retryAfterSeconds = metadata.retryAfterSeconds;
    this.activeChallenge = metadata.activeChallenge;
  }
}

export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!apiUrl) throw new Error('The API URL is not configured. Set VITE_API_URL.');
  const version = sessionRequestVersion();
  const initial = await currentAuthSession();
  const request = (session: Session | null) => {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (session) headers.set('Authorization', `Bearer ${session.access_token}`);
    else headers.delete('Authorization');
    return fetch(`${apiUrl.replace(/\/$/, '')}${path}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(30000) });
  };

  let attempted = initial;
  let response = await request(attempted);
  let failure = !response.ok ? await response.clone().json().catch(() => null) as { code?: string } | null : null;
  if (initial && response.status === 401 && failure?.code === 'SESSION_INVALID' && !init.signal?.aborted && version === sessionRequestVersion()) {
    const renewed = await refreshRejectedSession(initial);
    if (renewed) {
      attempted = renewed;
      response = await request(attempted);
      failure = !response.ok ? await response.clone().json().catch(() => null) as { code?: string } | null : null;
    }
  }
  if (initial && failure?.code && !init.signal?.aborted && version === sessionRequestVersion()) {
    // Ignore failures from requests that belonged to a login already replaced or ended.
    const stillCurrent = await currentAuthSession().then(current => sameAuthSession(initial, current)
      && current?.access_token === attempted?.access_token && version === sessionRequestVersion()).catch(() => false);
    if (stillCurrent) {
      if (failure.code === 'SESSION_INVALID' || (response.status === 403 && failure.code === 'ACCOUNT_DISABLED')) window.dispatchEvent(new CustomEvent('clinic:session-expired', { detail: { code: failure.code } }));
      if (failure.code === 'OTP_REQUIRED') window.dispatchEvent(new Event('clinic:otp-required'));
    }
  }
  return response;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const payload = await response.json().catch(() => null) as ({ error?: string; code?: string; details?: { fieldErrors?: Record<string, string[]> } } & OtpErrorMetadata) | null;
  if (!response.ok) {
    const details = Object.entries(payload?.details?.fieldErrors || {}).flatMap(([field, messages]) => messages.map(message => `${field}: ${message}`)).join(' ');
    throw new ApiError([payload?.error || `API request failed (${response.status}).`, details].filter(Boolean).join(' '), response.status, payload?.code, payload ?? {});
  }
  if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) window.dispatchEvent(new CustomEvent('clinic:data-changed', { detail: { path } }));
  return payload as T;
}
