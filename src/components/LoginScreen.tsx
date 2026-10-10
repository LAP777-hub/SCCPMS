import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
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

const roles: { value: Role; label: string; icon: typeof UserRound; description: string }[] = [
  { value: 'admin', label: 'Admin', icon: ShieldCheck, description: 'Full system administration' },
  { value: 'doctor', label: 'Doctor', icon: Stethoscope, description: 'Medical practitioner access' },
  { value: 'patient', label: 'Patient', icon: UserRound, description: 'Student & SPU staff access' },
  { value: 'receptionist', label: 'Receptionist', icon: UsersRound, description: 'Front desk operations' },
];

export default function LoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { signIn, pendingOtpUserId, pendingOtpPhone, otpError, verifyOtp, sendOtp, cancelOtp, requestPasswordReset } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role>('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resending, setResending] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter both your email and password.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email, password, selectedRole);
    setLoading(false);
    if (signInError) {
      setError(signInError);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!otpCode) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    const { error: verifyError } = await verifyOtp(pendingOtpUserId!, otpCode);
    setLoading(false);
    if (verifyError) setError(verifyError);
  };

  const handleResend = async () => {
    setError('');
    setResending(true);
    const { error: resendError } = await sendOtp();
    setResending(false);
    if (resendError) {
      setError(resendError);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const { error: resetError } = await requestPasswordReset(email);
    if (resetError) {
      setError(resetError);
      return;
    }
    setResetSent(true);
  };

  // OTP verification step
  if (pendingOtpUserId) {
    return (
      <div className="form-card">
        <div className="form-heading">
          <span className="mobile-kicker">TWO-FACTOR VERIFICATION</span>
          <h2>Verify Your Identity</h2>
          <p>Enter the 6-digit code sent to your phone{pendingOtpPhone ? ` ending in ${pendingOtpPhone.slice(-4)}` : ''}.</p>
        </div>

        <form onSubmit={handleVerify} className="login-form">
          <div className="section-heading">
            <span className="section-icon"><KeyRound size={22} /></span>
            <div>
              <h3>Verification Code</h3>
              <p>A one-time code was sent to your registered phone number.</p>
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
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter your code"
                  style={{ letterSpacing: '4px', fontSize: '18px' }}
                />
              </span>
            </label>
          </div>

          {(error || otpError) && <div className="login-error">{error || otpError}</div>}

          <div className="form-footer login-footer">
            <button className="secondary-button" type="button" onClick={cancelOtp}>
              <ArrowLeft size={19} /> Cancel
            </button>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Sign In'} <ShieldCheck size={19} />
            </button>
          </div>

          <div className="login-options" style={{ justifyContent: 'center', marginTop: '16px' }}>
            <button type="button" className="forgot-link" onClick={handleResend} disabled={resending}>
              <RefreshCw size={14} /> {resending ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </form>

        <div className="privacy-note"><LockKeyhole size={14} /> Two-factor authentication protects your account with an OTP sent to your phone.</div>
      </div>
    );
  }

  if (forgotMode) {
    return <div className="form-card">
      <div className="form-heading"><span className="mobile-kicker">ACCOUNT RECOVERY</span><h2>Reset your password</h2><p>We’ll send a recovery link if an account matches that email.</p></div>
      {resetSent ? <div className="success-state"><h3>Check your email</h3><p>If an account exists for <strong>{email}</strong>, password reset instructions have been sent.</p><button className="secondary-button" type="button" onClick={() => { setForgotMode(false); setResetSent(false); }}>Back to sign in</button></div> :
        <form className="login-form" onSubmit={handlePasswordReset}>
          <label className="field-group field-wide"><span className="field-label">Email Address</span><span className="field-control"><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></span></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <div className="form-footer"><button className="secondary-button" type="button" onClick={() => setForgotMode(false)}><ArrowLeft size={18} />Back</button><button className="primary-button" type="submit">Send reset link <ArrowRight size={18} /></button></div>
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
              onClick={() => setSelectedRole(role.value)}
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
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" />
            </span>
          </label>
          <label className="field-group field-wide">
            <span className="field-label">Password</span>
            <span className="field-control">
              <LockKeyhole size={18} strokeWidth={1.7} />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} strokeWidth={1.6} /> : <Eye size={18} strokeWidth={1.6} />}
              </button>
            </span>
          </label>
        </div>

        <div className="login-options">
          <label className="remember-me">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Keep me signed in</span>
          </label>
          <button type="button" className="forgot-link" onClick={() => { setForgotMode(true); setError(''); }}>Forgot password?</button>
        </div>

        {error && <div className="login-error">{error}</div>}

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
