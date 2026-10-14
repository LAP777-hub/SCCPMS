export type AuthCallbackAction = 'signup' | 'invite' | 'recovery';

function supportedAction(value: string | null): AuthCallbackAction | null {
  return value === 'signup' || value === 'invite' || value === 'recovery' ? value : null;
}

// Capture callback intent before the Supabase client consumes the URL tokens.
const hash = new URLSearchParams(window.location.hash.slice(1));
const query = new URLSearchParams(window.location.search);
const callbackValue = (key: string) => hash.get(key) ?? query.get(key);
const action = supportedAction(callbackValue('type')) ?? supportedAction(query.get('auth_action'));
const hasError = ['error', 'error_code', 'error_description'].some((key) => Boolean(callbackValue(key)));
const accessToken = callbackValue('access_token');
const code = query.get('code');

export const authCallback = {
  action,
  hasError,
  accessToken,
  code,
  hasCredentials: Boolean(accessToken || code),
  present: hasError || Boolean(action || accessToken || code),
  emailLinkPending: query.has('email_action') || query.has('confirmation_url'),
};

export function authSessionId(accessToken: string): string | null {
  try {
    const claims = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: unknown };
    return typeof claims.session_id === 'string' && claims.session_id ? claims.session_id : null;
  } catch { return null; }
}

export function scrubAuthCallback() {
  if (!authCallback.present) return;
  const url = new URL(window.location.href);
  for (const key of ['auth_action', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'code', 'error', 'error_code', 'error_description']) {
    url.searchParams.delete(key);
  }
  url.hash = '';
  window.history.replaceState(window.history.state, '', url);
}
