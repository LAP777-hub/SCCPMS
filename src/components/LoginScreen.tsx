import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
  KeyRound,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { Role } from '../lib/supabase';
import PasswordToggle from './PasswordToggle';

const roles: { value: Role; label: string; icon: typeof UserRound; description: string }[] = [
  { value: 'admin', label: 'Admin', icon: ShieldCheck, description: 'Full system administration' },
  { value: 'doctor', label: 'Doctor', icon: Stethoscope, description: 'Medical practitioner access' },
  { value: 'patient', label: 'Patient', icon: UserRound, description: 'Student & SPU staff access' },
  { value: 'receptionist', label: 'Receptionist', icon: UsersRound, description: 'Front desk operations' },
];

export default function LoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { signIn, pendingOtpUserId, pendingOtpEmail, otpError, otpNotice, otpSending, otpChallengeReady, otpExpiresAt, otpRetryAt, signInHint, authCallbackError, authCallbackNotice, authCallbackRetry, accountSuspended, verifyOtp, sendOtp, cancelOtp, requestPasswordReset } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role>(signInHint?.role ?? 'patient');
  const [email, setEmail] = useState(signInHint?.email ?? '');
  const emailEdited = useRef(false);
  const roleSelected = useRef(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resending, setResending] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!signInHint) return;
    if (!emailEdited.current) setEmail(signInHint.email);
    if (!roleSelected.current) setSelectedRole(signInHint.role);
  }, [signInHint]);
  useEffect(() => {
    if (!pendingOtpUserId) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingOtpUserId, otpExpiresAt, otpRetryAt]);
  const codeSecondsRemaining = otpExpiresAt === null ? null : Math.max(0, Math.ceil((otpExpiresAt - now) / 1000));
  const resendSecondsRemaining = otpRetryAt === null ? 0 : Math.max(0, Math.ceil((otpRetryAt - now) / 1000));
  const codeExpired = codeSecondsRemaining === 0;
  const canVerify = otpChallengeReady && !codeExpired;
  const countdown = codeSecondsRemaining === null ? '' : `${Math.floor(codeSecondsRemaining / 60)}:${String(codeSecondsRemaining % 60).padStart(2, '0')}`;
  const loginError = accountSuspended ? <>
    <strong>Your account has been suspended</strong><br />
    Contact admin: <a href="mailto:luckypinga077@gmail.com">luckypinga077@gmail.com</a>
  </> : error || authCallbackError || otpError;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (!email || !password) {
      setError('Please enter both your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await signIn(email, password, selectedRole);
      if (signInError) setError(signInError);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (otpSending || !canVerify) {
      setError(codeExpired ? 'This code has expired. Request a new code.' : 'Wait for your verification email, or request a code to continue.');
      return;
    }
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    const { error: verifyError } = await verifyOtp(pendingOtpUserId!, otpCode);
    setLoading(false);
    if (verifyError) setError(verifyError);
  };

  const handleResend = async () => {
    if (loading || resending || otpSending || resendSecondsRemaining > 0) return;
    setError('');
    setResending(true);
    const { error: resendError } = await sendOtp();
    setResending(false);
    if (resendError) {
      setError(resendError);
    } else setOtpCode('');
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resetting) return;
    setError('');
    setResetting(true);
    try {
      const { error: resetError } = await requestPasswordReset(email);
      if (resetError) setError(resetError);
      else setResetSent(true);
    } finally { setResetting(false); }
  };

  // OTP verification step
  if (pendingOtpUserId) {
    return (
      <div className="form-card">
        <div className="form-heading">
          <span className="mobile-kicker">TWO-FACTOR VERIFICATION</span>
          <h2>Verify Your Identity</h2>
          <p>{otpSending && !otpChallengeReady ? 'Sending a verification code to your account email' : otpChallengeReady ? 'Enter the 6-digit code sent to your email' : 'Request a 6-digit verification code for your account email'}{pendingOtpEmail ? ` (${pendingOtpEmail})` : ''}.</p>
        </div>

        <form onSubmit={handleVerify} className="login-form">
          {otpNotice && <p role="status">{otpNotice}</p>}
          <div className="section-heading">
            <span className="section-icon"><KeyRound size={22} /></span>
            <div>
              <h3>Verification Code</h3>
              <p>{otpSending && !otpChallengeReady ? 'Wait for the email request to finish. Your code timer starts once the provider accepts it.' : otpChallengeReady && !codeExpired ? 'Check your inbox and spam folder for the latest code.' : 'Request a new code below, then check your inbox and spam folder.'}</p>
              {otpChallengeReady && codeSecondsRemaining !== null && <p data-testid="otp-expiry">{codeExpired ? 'This code has expired. Request a new code.' : `Code expires in ${countdown}.`}</p>}
            </div>
          </div>

          <div className="fields-grid login-fields">
            <label className="field-group field-wide">
              <span className="field-label">6-Digit Code</span>
              <span className="field-control">
                <KeyRound size={18} strokeWidth={1.7} />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  disabled={!canVerify || (otpSending && !otpChallengeReady)}
                  pattern="[0-9]{6}"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter your code"
                  style={{ letterSpacing: '4px', fontSize: '18px' }}
                />
              </span>
            </label>
          </div>

          {loginError && <div className="login-error" role="alert">{loginError}</div>}

          <div className="form-footer login-footer">
            <button className="secondary-button" type="button" onClick={cancelOtp} disabled={loading || resending || otpSending}>
              <ArrowLeft size={19} /> Cancel
            </button>
            <button className="primary-button" type="submit" disabled={loading || resending || otpSending || !canVerify}>
              {otpSending ? 'Sending code...' : loading ? 'Verifying...' : 'Verify & Sign In'} <ShieldCheck size={19} />
            </button>
          </div>

          <div className="login-options" style={{ justifyContent: 'center', marginTop: '16px' }}>
            <button type="button" className="forgot-link" onClick={handleResend} disabled={resending || loading || otpSending || resendSecondsRemaining > 0}>
              <RefreshCw size={14} /> {resending || otpSending ? 'Sending...' : resendSecondsRemaining > 0 ? `Resend in ${resendSecondsRemaining}s` : 'Resend code'}
            </button>
          </div>
        </form>

        <div className="privacy-note"><LockKeyhole size={14} /> Two-factor authentication protects your account with a one-time code sent to your account email.</div>
      </div>
    );
  }

  if (forgotMode) {
    return <div className="form-card">
      <div className="form-heading"><span className="mobile-kicker">ACCOUNT RECOVERY</span><h2>Reset your password</h2><p>We’ll send a recovery link if an account matches that email.</p></div>
      {resetSent ? <div className="success-state"><h3>Check your email</h3><p>If an account exists for <strong>{email}</strong>, password reset instructions have been sent.</p><button className="secondary-button" type="button" onClick={() => { setForgotMode(false); setResetSent(false); }}>Back to sign in</button></div> :
        <form className="login-form" onSubmit={handlePasswordReset}>
          <label className="field-group field-wide"><span className="field-label">Email Address</span><span className="field-control"><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={(event) => { emailEdited.current = true; setEmail(event.target.value); }} required /></span></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <div className="form-footer"><button className="secondary-button" type="button" disabled={resetting} onClick={() => setForgotMode(false)}><ArrowLeft size={18} />Back</button><button className="primary-button" type="submit" disabled={resetting}>{resetting ? 'Sending reset link...' : 'Send reset link'} <ArrowRight size={18} /></button></div>
        </form>}
    </div>;
  }

  return (
    <div className="form-card">
      <div className="form-heading">
        <span className="mobile-kicker">ACCOUNT LOGIN</span>
        <h2>Welcome Back</h2>
        <p>Sign in to access your SCCPMS dashboard.</p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        <div className="section-heading">
          <span className="section-icon"><LogIn size={22} /></span>
          <div>
            <h3>Select Your Role</h3>
            <p>Choose the account type you registered with.</p>
          </div>
        </div>

        <div className="role-selector role-selector-4">
          {roles.map((role) => (
            <button
              type="button"
              key={role.value}
              className={`role-card ${selectedRole === role.value ? 'selected' : ''}`}
              onClick={() => { roleSelected.current = true; setSelectedRole(role.value); }}
            >
              <span className="role-card-icon"><role.icon size={24} strokeWidth={1.6} /></span>
              <span className="role-card-text">
                <strong>{role.label}</strong>
                <small>{role.description}</small>
              </span>
              <span className="role-card-check">{selectedRole === role.value && <ShieldCheck size={18} />}</span>
            </button>
          ))}
        </div>

        <div className="section-heading" style={{ marginTop: '28px' }}>
          <span className="section-icon"><Mail size={22} /></span>
          <div>
            <h3>Account Credentials</h3>
            <p>Enter your email and password to continue.</p>
          </div>
        </div>

        <div className="fields-grid login-fields">
          <label className="field-group field-wide">
            <span className="field-label">Email Address</span>
            <span className="field-control">
              <Mail size={18} strokeWidth={1.7} />
              <input type="email" autoComplete="username" required value={email} onChange={(e) => { emailEdited.current = true; setEmail(e.target.value); }} placeholder="Enter your email address" />
            </span>
          </label>
          <div className="field-group field-wide">
            <label className="field-label" htmlFor="login-password">Password</label>
            <span className="field-control">
              <LockKeyhole size={18} strokeWidth={1.7} />
              <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
              <PasswordToggle inputId="login-password" fieldName="password" visible={showPassword} onToggle={() => setShowPassword(value => !value)} disabled={loading} />
            </span>
          </div>
        </div>

        <div className="login-options">
          <span className="remember-me">Email verification required</span>
          <button type="button" className="forgot-link" onClick={() => { setForgotMode(true); setError(''); }}>Forgot password?</button>
        </div>

        {authCallbackNotice && <p role="status">{authCallbackNotice}</p>}
        {loginError && <div className="login-error" role="alert">{loginError}</div>}
        {authCallbackRetry && <button className="secondary-button" type="button" onClick={() => window.location.reload()}>Retry account link</button>}

        <div className="form-footer login-footer">
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'} <ArrowRight size={19} />
          </button>
        </div>
      </form>

      <div className="switch-view">
        Don't have an account?{' '}
        <button type="button" onClick={onSwitchToRegister}>Create one now</button>
      </div>

      <div className="privacy-note"><LockKeyhole size={14} /> Your information is safe and will only be used for authorized SCCPMS purposes.</div>
    </div>
  );
}
