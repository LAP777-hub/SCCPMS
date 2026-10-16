import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowRight, KeyRound, LockKeyhole } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import PasswordToggle from './PasswordToggle';
import BrandPanel from './BrandPanel';
import './PasswordRecoveryScreen.css';

export default function PasswordRecoveryScreen({ invitation = false }: { invitation?: boolean }) {
  const { session, profile, loading: checkingSession, completePasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const invitationDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!invitation) return;
    const dialog = invitationDialog.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>(updated ? '.primary-button' : '#setup-password')?.focus({ preventScroll: true });
    return () => { if (dialog.open) dialog.close(); };
  }, [invitation, updated]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || checkingSession || !session) return;
    setError('');
    if (password.length < 12) {
      setError('Use at least 12 characters for your new password.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await completePasswordRecovery(password);
      if (result.error) setError(result.error);
      else setUpdated(true);
    } catch {
      setError('Unable to update your password right now. Please try again.');
    } finally { setLoading(false); }
  }

  async function returnToSignIn() {
    if (loading) return;
    setLoading(true);
    setError('');
    try { await signOut(); }
    catch { setError('Unable to finish signing out. Please try again.'); }
    finally { setLoading(false); }
  }

  const passwordForm = <div className="form-card">
    <div className="form-heading"><span className="mobile-kicker">ACCOUNT SECURITY</span><h2 id="password-setup-heading">{invitation ? 'Set your password' : 'Reset your password'}</h2><p id="password-setup-description">{invitation ? 'Create and confirm your own password for your invited SCCPMS account. Then sign in with your email, password and assigned role.' : 'Choose a new password for your SCCPMS account.'}</p></div>
    {profile?.email && <p>Account: {profile.email}</p>}
    {updated ? <div className="success-state"><span className="success-icon"><KeyRound size={30} /></span><h3>Password updated</h3><p>Sign in again with your new password and enter the verification code sent to your email.</p>{error && <div className="login-error" role="alert">{error}</div>}<button className="primary-button" type="button" disabled={loading} onClick={() => void returnToSignIn()}>{loading ? 'Returning to sign in...' : 'Return to sign in'} <ArrowRight size={18} /></button></div> :
      <form className="login-form" onSubmit={submit}>
        <div className="field-group field-wide"><label className="field-label" htmlFor="setup-password">New Password</label><span className="field-control"><LockKeyhole size={18} /><input id="setup-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading || checkingSession} required /><PasswordToggle inputId="setup-password" fieldName="new password" visible={showPassword} onToggle={() => setShowPassword(value => !value)} disabled={loading || checkingSession} /></span></div>
        <div className="field-group field-wide"><label className="field-label" htmlFor="setup-confirmation">Confirm Password</label><span className="field-control"><LockKeyhole size={18} /><input id="setup-confirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={loading || checkingSession} required /><PasswordToggle inputId="setup-confirmation" fieldName="confirm password" visible={showConfirmation} onToggle={() => setShowConfirmation(value => !value)} disabled={loading || checkingSession} /></span></div>
        {error && <div className="login-error" role="alert">{error}</div>}
        {checkingSession && <p role="status">Checking your account link...</p>}
        <button className="primary-button" type="submit" disabled={loading || checkingSession || !session}>{loading ? 'Updating...' : 'Update Password'} <ArrowRight size={18} /></button>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void returnToSignIn()}>{loading ? 'Returning to sign in...' : 'Return to sign in'}</button>
      </form>}
  </div>;

  return <main className="portal-shell"><BrandPanel /><section className="form-panel">
    {invitation ? <div className="form-card invitation-password-background" aria-hidden="true">
      <div className="form-heading"><span className="mobile-kicker">STAFF ACCOUNT</span><h2>Welcome to SCCPMS</h2><p>Finish setting up your invited clinic account to sign in.</p></div>
    </div> : passwordForm}
  </section>{invitation && <dialog ref={invitationDialog} className="invitation-password-modal"
    aria-labelledby="password-setup-heading" aria-describedby="password-setup-description"
    onCancel={event => event.preventDefault()}>{passwordForm}</dialog>}</main>;
}
