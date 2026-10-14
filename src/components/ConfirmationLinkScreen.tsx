import { useEffect, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import BrandPanel from './BrandPanel';
import type { PendingEmailConfirmation } from '../lib/emailConfirmation';

export default function ConfirmationLinkScreen({ confirmation }: { confirmation: PendingEmailConfirmation }) {
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    const current = new URL(window.location.href);
    for (const key of ['email_action', 'confirmation_url', 'auth_action', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'code', 'token', 'token_hash', 'type']) current.searchParams.delete(key);
    current.hash = '';
    window.history.replaceState(window.history.state, '', current);
    const existing = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const previous = existing?.content;
    const policy = existing ?? document.createElement('meta');
    policy.name = 'referrer';
    policy.content = 'no-referrer';
    if (!existing) document.head.append(policy);
    return () => { if (existing) existing.content = previous ?? ''; else policy.remove(); };
  }, []);

  const heading = confirmation.action === 'invite' ? 'Accept your clinic invitation'
    : confirmation.action === 'recovery' ? 'Continue your password reset' : 'Confirm your email address';
  return <main className="portal-shell"><BrandPanel /><section className="form-panel"><div className="form-card">
    <div className="form-heading"><span className="mobile-kicker">ACCOUNT VERIFICATION</span><h2>{heading}</h2>
      <p>{confirmation.action === 'invite' ? 'Continue to verify your invitation and choose your own password.'
        : confirmation.action === 'recovery' ? 'Continue to verify your email link and choose a new password.' : 'Continue to confirm your email address.'}</p>
    </div>
    {confirmation.confirmationUrl ? <>
      <p>Continue if you requested this email or received a clinic invitation.</p>
      <button className="primary-button" type="button" disabled={continuing} onClick={() => {
        setContinuing(true);
        window.location.assign(confirmation.confirmationUrl!);
      }}>{continuing ? 'Continuing...' : 'Continue'} <ArrowRight size={18} /></button>
    </> : <div className="login-error" role="alert"><Mail size={18} /> This account link is invalid or belongs to another SCCPMS address. Open the latest email or contact the clinic administrator.</div>}
    <button className="secondary-button" type="button" onClick={() => window.location.assign(window.location.origin)}>Return to sign in</button>
  </div></section></main>;
}
