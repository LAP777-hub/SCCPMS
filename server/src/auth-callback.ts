import { config } from './config.js';

export type AuthAction = 'signup' | 'invite' | 'recovery';

export function authCallbackUrl(action: AuthAction, origin = config.FRONTEND_ORIGIN): string {
  const callback = new URL('/', origin);
  callback.searchParams.set('auth_action', action);
  return callback.toString();
}
