export type EmailAction = 'signup' | 'invite' | 'recovery';
export type PendingEmailConfirmation = { action: EmailAction | null; confirmationUrl: string | null };

export function pendingEmailConfirmation(locationUrl: string, supabaseUrl: string): PendingEmailConfirmation | null {
  const location = new URL(locationUrl);
  const query = location.searchParams;
  if (!query.has('email_action') && !query.has('confirmation_url')) return null;
  const rawAction = query.get('email_action');
  const action = ['signup', 'invite', 'recovery'].includes(rawAction ?? '') ? rawAction as EmailAction : null;
  const invalid = { action, confirmationUrl: null };
  try {
    if (!action || query.getAll('email_action').length !== 1 || query.getAll('confirmation_url').length !== 1 || location.hash) return invalid;
    if (['access_token', 'refresh_token', 'code', 'token', 'token_hash', 'type', 'auth_action'].some(key => query.has(key))) return invalid;
    const rawUrl = query.get('confirmation_url');
    if (!rawUrl || rawUrl.length > 4096) return invalid;
    const confirmation = new URL(rawUrl);
    const provider = new URL(supabaseUrl);
    if (provider.protocol !== 'https:' || confirmation.protocol !== 'https:' || confirmation.origin !== provider.origin
      || confirmation.username || confirmation.password || confirmation.port || confirmation.hash
      || confirmation.pathname !== '/auth/v1/verify') return invalid;
    const params = confirmation.searchParams;
    if ([...params.keys()].some(key => !['token', 'type', 'redirect_to'].includes(key))) return invalid;
    if (['token', 'type', 'redirect_to'].some(key => params.getAll(key).length !== 1)) return invalid;
    if (!/^[A-Za-z0-9_-]{16,512}$/.test(params.get('token') ?? '')) return invalid;
    const type = params.get('type');
    if (type !== action && !(action === 'signup' && type === 'email')) return invalid;
    const redirect = new URL(params.get('redirect_to')!);
    if (redirect.origin !== location.origin || redirect.username || redirect.password || !['http:', 'https:'].includes(redirect.protocol)) return invalid;
    const callback = new URL('/', location.origin);
    callback.searchParams.set('auth_action', action);
    params.set('redirect_to', callback.toString());
    return { action, confirmationUrl: confirmation.toString() };
  } catch { return invalid; }
}
