import { FormEvent, useState } from 'react';
import { ArrowRight, KeyRound, LockKeyhole } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function PasswordRecoveryScreen({ invitation = false }: { invitation?: boolean }) {
  const { completePasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const result = await completePasswordRecovery(password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setUpdated(true);
  }

  return <main className="portal-shell"><section className="form-panel"><div className="form-card">
    <div className="form-heading"><span className="mobile-kicker">ACCOUNT SECURITY</span><h2>{invitation ? 'Set your password' : 'Reset your password'}</h2><p>{invitation ? 'Create a password to activate your invited SCCPMS account.' : 'Choose a new password for your SCCPMS account.'}</p></div>
    {updated ? <div className="success-state"><span className="success-icon"><KeyRound size={30} /></span><h3>Password updated</h3><p>Sign in again with your new password and verify your phone to continue.</p><button className="primary-button" type="button" onClick={() => void signOut()}>Return to sign in <ArrowRight size={18} /></button></div> :
      <form className="login-form" onSubmit={submit}>
        <label className="field-group field-wide"><span className="field-label">New Password</span><span className="field-control"><LockKeyhole size={18} /><input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></span></label>
        <label className="field-group field-wide"><span className="field-label">Confirm Password</span><span className="field-control"><LockKeyhole size={18} /><input type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></span></label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Updating…' : 'Update Password'} <ArrowRight size={18} /></button>
      </form>}
  </div></section></main>;
}
