import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { isAuthApiError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { supabase, clearStoredAuthSession, type Profile, type Role } from './supabase';
import { apiRequest, ApiError, type OtpChallengeMetadata } from './api';
import { connectClinicUpdates } from './realtime';
import { invalidateSessionRequests, sameAuthSession, sessionRequestVersion, SessionUnavailableError } from './session';
import { authCallback, authSessionId, scrubAuthCallback, type AuthCallbackAction } from './authCallback';
import { AUTH_TIMEOUT_MESSAGE } from './authFetch';

type PasswordSetup = { kind: 'recovery' | 'invite'; userId: string; sessionId: string };
type SignInHint = { email: string; role: Role };
const passwordSetupKey = 'sccpms:password-setup';
const callbackUnavailableMessage = 'The account service is unavailable right now. Check your connection and try again. If this one-use email link was already consumed, use Forgot password to request a fresh account link.';

function unavailableAuthService(error: unknown) {
  return isAuthRetryableFetchError(error)
    || (isAuthApiError(error) && error.status >= 500)
    || (error instanceof Error && error.message === AUTH_TIMEOUT_MESSAGE);
}

function callbackFailure(kind: AuthCallbackAction | null = authCallback.action) {
  if (kind === 'invite') return 'This invitation link has expired or is invalid. Ask the clinic administrator to resend your invitation.';
  if (kind === 'recovery') return 'This password reset link has expired or is invalid. Request a new reset link using Forgot password.';
  if (kind === 'signup') return 'This email confirmation link has expired or is invalid. Use the latest confirmation email, or contact the clinic administrator for a new link.';
  return 'This account link has expired or is invalid. Request a new password reset link, or ask the clinic administrator to resend your invitation.';
}

function retryableProfileFailure(error: unknown) {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) return true;
  const status = error instanceof ApiError || error instanceof SessionUnavailableError ? error.status : null;
  return status === 408 || status === 425 || status === 429 || (status !== null && status >= 500);
}

function savedPasswordSetup(): PasswordSetup | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(passwordSetupKey) ?? 'null') as Partial<PasswordSetup> | null;
    if (value && ['recovery', 'invite'].includes(value.kind ?? '') && typeof value.userId === 'string' && typeof value.sessionId === 'string' && Boolean(value.sessionId)) return value as PasswordSetup;
    sessionStorage.removeItem(passwordSetupKey);
    return null;
  } catch { return null; }
}

function storePasswordSetup(value: PasswordSetup | null) {
  try {
    if (value) sessionStorage.setItem(passwordSetupKey, JSON.stringify(value));
    else sessionStorage.removeItem(passwordSetupKey);
  } catch { /* Password setup still works when browser storage is unavailable. */ }
}

function maskOtpEmail(email: string | null | undefined) {
  if (!email) return null;
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return null;
  return `${email.slice(0, Math.min(2, separator))}***${email.slice(separator)}`;
}

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  otpVerified: boolean;
  pendingOtpUserId: string | null;
  pendingOtpEmail: string | null;
  otpError: string;
  otpNotice: string;
  otpSending: boolean;
  otpChallengeReady: boolean;
  otpExpiresAt: number | null;
  otpRetryAt: number | null;
  signInHint: SignInHint | null;
  passwordRecoveryRequired: boolean;
  invitationSetupRequired: boolean;
  authCallbackError: string;
  authCallbackNotice: string;
  authCallbackRetry: boolean;
  accountSuspended: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string, role: Role) => Promise<{ error: string | null }>;
  signUp: (params: {
    email: string;
    password: string;
    userType?: string;
    fullName?: string;
    phone?: string;
    studentCategory?: string | null;
    studentNumber?: string;
    staffNumber?: string;
    department?: string;
    program?: string;
    addressLine1?: string;
    addressLatitude?: number;
    addressLongitude?: number;
    addressSource?: 'manual' | 'photon';
    addressLine2?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    nextOfKinName?: string;
    nextOfKinRelationship?: string;
    nextOfKinPhone?: string;
  }) => Promise<{ error: string | null; message?: string }>;
  sendOtp: () => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  completePasswordRecovery: (password: string) => Promise<{ error: string | null }>;
  verifyOtp: (userId: string, code: string) => Promise<{ error: string | null }>;
  cancelOtp: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpVerified, setOtpVerified] = useState(false);
  const [pendingOtpUserId, setPendingOtpUserId] = useState<string | null>(null);
  const [pendingOtpEmail, setPendingOtpEmail] = useState<string | null>(null);
  const [otpError, setOtpError] = useState('');
  const [otpNotice,setOtpNotice] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpChallengeReady, setOtpChallengeReady] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpRetryAt, setOtpRetryAt] = useState<number | null>(null);
  const [signInHint, setSignInHint] = useState<SignInHint | null>(null);
  const verificationVersion = useRef(0);
  const signInAttempt = useRef(0);
  const setup = useRef(authCallback.hasError ? null : savedPasswordSetup());
  const recoveryMode = useRef(false);
  const invitationMode = useRef(false);
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] = useState(false);
  const [invitationSetupRequired, setInvitationSetupRequired] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState(authCallback.hasError ? callbackFailure() : '');
  const [authCallbackNotice, setAuthCallbackNotice] = useState('');
  const [authCallbackRetry, setAuthCallbackRetry] = useState(false);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const suspensionShown = useRef(false);
  const [checkingCallback, setCheckingCallback] = useState(Boolean(authCallback.present || setup.current));
  const callbackAccount = useRef<string | null>(null);
  const currentSession = useRef<Session | null>(null);
  const currentUserId = useRef<string | null>(null);
  const accountOtpEmail = useRef<string | null>(null);
  const authenticatedUserId = session?.user.id ?? null;
  const authenticatedSessionId = session ? authSessionId(session.access_token) ?? session.access_token : null;

  const resetOtpChallenge = useCallback(() => {
    setOtpSending(false);
    setOtpChallengeReady(false);
    setOtpExpiresAt(null);
    setOtpRetryAt(null);
  }, []);

  const applyOtpChallenge = useCallback((challenge: OtpChallengeMetadata) => {
    const absoluteExpiry = challenge.expiresAt ? Date.parse(challenge.expiresAt) : NaN;
    const seconds = challenge.expiresInSeconds;
    const expiry = Number.isFinite(absoluteExpiry) ? absoluteExpiry
      : typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
        ? Date.now() + seconds * 1000 : null;
    setOtpChallengeReady(expiry === null || expiry > Date.now());
    setOtpExpiresAt(expiry);
    if (challenge.destination) setPendingOtpEmail(challenge.destination);
  }, []);

  const applyOtpRetry = useCallback((seconds: number | undefined) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return;
    setOtpRetryAt(seconds > 0 ? Date.now() + Math.min(seconds, 3600) * 1000 : null);
  }, []);

  const suspendAccount = useCallback(() => {
    if (suspensionShown.current) return;
    suspensionShown.current = true;
    signInAttempt.current += 1;
    invalidateSessionRequests();
    verificationVersion.current += 1;
    currentSession.current = null;
    currentUserId.current = null;
    accountOtpEmail.current = null;
    callbackAccount.current = null;
    setup.current = null;
    storePasswordSetup(null);
    recoveryMode.current = false;
    invitationMode.current = false;
    setAccountSuspended(true);
    setSession(null);
    setProfile(null);
    setOtpVerified(false);
    setPendingOtpUserId(null);
    setPendingOtpEmail(null);
    setOtpError('');
    setOtpNotice('');
    resetOtpChallenge();
    setPasswordRecoveryRequired(false);
    setInvitationSetupRequired(false);
    setAuthCallbackError('');
    setAuthCallbackNotice('');
    setAuthCallbackRetry(false);
    setLoading(false);
    // Keep the reason visible after SIGNED_OUT removes cached credentials.
    void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, [resetOtpChallenge]);

  const refreshProfile = useCallback(async () => {
    const expectedSession = currentSession.current;
    const version = sessionRequestVersion();
    if (!expectedSession) return;
    const { data } = await apiRequest<{ data: Profile }>('/auth/profile');
    if (version === sessionRequestVersion() && sameAuthSession(expectedSession, currentSession.current)) {
      setProfile(data);
      accountOtpEmail.current = maskOtpEmail(data.email);
    }
  }, []);

  useEffect(() => {
    if (!authenticatedUserId || !otpVerified) return;
    return connectClinicUpdates();
  }, [authenticatedUserId, otpVerified]);

  useEffect(() => {
    if (!otpVerified) return;
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string; path?: string }>).detail;
      if (detail?.table === 'profiles' || detail?.table === 'account_status' || detail?.path === '/api/profile') {
        void refreshProfile().catch(error => setOtpError(error instanceof Error ? error.message : 'Unable to refresh your account.'));
      }
    };
    window.addEventListener('clinic:data-changed', updated);
    return () => window.removeEventListener('clinic:data-changed', updated);
  }, [otpVerified, refreshProfile]);

  useEffect(() => {
    const expireSession = (event: Event) => {
      if ((event as CustomEvent<{ code?: string }>).detail?.code === 'ACCOUNT_DISABLED') suspendAccount();
      else void supabase.auth.signOut();
    };
    window.addEventListener('clinic:session-expired', expireSession);
    return () => window.removeEventListener('clinic:session-expired', expireSession);
  }, [suspendAccount]);

  useEffect(() => {
    const requireVerification = () => {
      invalidateSessionRequests();
      verificationVersion.current += 1;
      setOtpVerified(false);
      setPendingOtpUserId(currentUserId.current);
      setPendingOtpEmail(accountOtpEmail.current);
      setOtpNotice('');
      resetOtpChallenge();
      setOtpError('Your email verification has expired. Request a new code to continue.');
    };
    window.addEventListener('clinic:otp-required', requireVerification);
    return () => window.removeEventListener('clinic:otp-required', requireVerification);
  }, [resetOtpChallenge]);

  useEffect(() => {
    let active = true;
    (async () => {
      const initialization = await supabase.auth.initialize();
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      // A code left in the URL was not exchanged by the SDK. A previously
      // stored login must never substitute for an invalid PKCE callback.
      const exchangedCode = Boolean(authCallback.code) && !new URL(window.location.href).searchParams.has('code');
      scrubAuthCallback();
      const restored = data.session;
      currentUserId.current = restored?.user.id ?? null;
      currentSession.current = restored;
      setSession(restored);

      const callbackSucceeded = authCallback.present && !authCallback.hasError && !initialization.error && !error
        && Boolean(restored) && authCallback.hasCredentials
        && (authCallback.accessToken
          ? Boolean(authSessionId(authCallback.accessToken)) && authSessionId(authCallback.accessToken) === authSessionId(restored!.access_token)
          : exchangedCode);
      const callbackServiceUnavailable = !authCallback.hasError
        && (unavailableAuthService(initialization.error) || unavailableAuthService(error));
      if (authCallback.present && !callbackSucceeded) {
        setAuthCallbackError(callbackServiceUnavailable ? callbackUnavailableMessage : callbackFailure());
        setup.current = null;
        storePasswordSetup(null);
      }
      if (!restored) {
        if (setup.current) setAuthCallbackError(callbackServiceUnavailable ? callbackUnavailableMessage : callbackFailure(setup.current.kind));
        storePasswordSetup(null);
        setup.current = null;
        setLoading(false);
        return;
      }

      const stored = setup.current;
      const storedMatches = !authCallback.present && stored?.userId === restored.user.id
        && stored.sessionId === authSessionId(restored.access_token);
      if (stored && !storedMatches && !callbackSucceeded) {
        setup.current = null;
        storePasswordSetup(null);
      }
      const action = callbackSucceeded ? authCallback.action : storedMatches ? stored!.kind : null;
      if (action) {
        let rejectedAccount = false;
        const sessionId = authSessionId(restored.access_token);
        if (action !== 'signup' && sessionId) {
          // Save the successful Supabase callback before the clinic account
          // request. A network outage must not discard a single-use invite.
          // This intent alone never opens setup; every reload validates it.
          setup.current = { kind: action, userId: restored.user.id, sessionId };
          storePasswordSetup(setup.current);
        }
        try {
          // The server validates the JWT, confirmed email, active account and
          // university identity. Callback parameters never supply the role.
          const { data: trusted } = await apiRequest<{ data: Profile }>('/auth/profile');
          const { data: latest, error: sessionError } = await supabase.auth.getSession();
          if (!active || !sameAuthSession(restored, currentSession.current)) return;
          if (sessionError) throw new SessionUnavailableError();
          if (!sameAuthSession(restored, latest.session)) return;
          if (trusted.id !== restored.user.id || !['admin', 'doctor', 'receptionist', 'patient', 'student', 'lecturer', 'staff'].includes(trusted.role)) {
            rejectedAccount = true;
            throw new Error('This account could not be verified. Contact the clinic administrator.');
          }
          if (action === 'signup') {
            // Registration already collected a password. Confirmation returns
            // to credentials; it does not skip the separate email OTP check.
            const attempt = signInAttempt.current;
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
            if (!active || attempt !== signInAttempt.current || (currentSession.current && !sameAuthSession(restored, currentSession.current))) return;
            if (signOutError) {
              clearStoredAuthSession();
              currentSession.current = null;
              currentUserId.current = null;
              setSession(null);
              setProfile(null);
            }
            setSignInHint({ email: trusted.email, role: ['student', 'lecturer', 'staff'].includes(trusted.role) ? 'patient' : trusted.role });
            setAuthCallbackNotice('Your email is confirmed. Sign in with your password, then enter the email verification code to open your dashboard.');
            setLoading(false);
            return;
          }
          if (!sessionId) throw new Error(callbackFailure(action));
          const intent: PasswordSetup = { kind: action, userId: restored.user.id, sessionId };
          setup.current = intent;
          storePasswordSetup(intent);
          callbackAccount.current = trusted.id;
          setProfile(trusted);
          accountOtpEmail.current = maskOtpEmail(trusted.email);
          recoveryMode.current = action === 'recovery';
          invitationMode.current = action === 'invite';
          setPasswordRecoveryRequired(recoveryMode.current);
          setInvitationSetupRequired(invitationMode.current);
          setPendingOtpUserId(null);
          setPendingOtpEmail(null);
          setOtpVerified(false);
          setLoading(false);
          return;
        } catch (failure) {
          // An older account-check failure must not clear setup or sign out a
          // login that replaced this callback while the request was pending.
          if (!active || !sameAuthSession(restored, currentSession.current)) return;
          const permanent = rejectedAccount || (failure instanceof ApiError && [400, 401, 403, 404, 410].includes(failure.status));
          if (!permanent && action !== 'signup' && setup.current && sameAuthSession(restored, currentSession.current)) {
            setAuthCallbackError('Unable to check your account right now. Retry your account link when your connection is restored.');
            setAuthCallbackRetry(true);
            setLoading(false);
            return;
          }
          setAuthCallbackError(!permanent && action === 'signup'
            ? 'Unable to finish checking your account right now. Try signing in with your existing password when your connection is restored.'
            : 'Your account link could not be verified. Use the latest email link or contact the clinic administrator.');
          setup.current = null;
          storePasswordSetup(null);
          recoveryMode.current = false;
          invitationMode.current = false;
          setPasswordRecoveryRequired(false);
          setInvitationSetupRequired(false);
          // A failed account check must not leave a setup-capable session.
          await supabase.auth.signOut({ scope: 'local' });
          setLoading(false);
          return;
        }
      }

      const version = verificationVersion.current;
      setPendingOtpUserId(restored.user.id);
      void apiRequest<{ verified: boolean; activeChallenge?: OtpChallengeMetadata | null; retryAfterSeconds?: number }>('/auth/otp/status')
        .then(({ verified, activeChallenge, retryAfterSeconds }) => {
          if (!active || version !== verificationVersion.current || !sameAuthSession(restored, currentSession.current)) return;
          setOtpVerified(verified);
          if (verified) setPendingOtpUserId(null);
          else if (activeChallenge) applyOtpChallenge(activeChallenge);
          else { setOtpChallengeReady(false); setOtpExpiresAt(null); }
          applyOtpRetry(retryAfterSeconds);
          // A concurrent profile failure must remain visible when this later
          // verification-status response succeeds.
          setOtpError(currentError => currentError || (verified || activeChallenge ? '' : 'Request a verification code to continue.'));
        })
        .catch((failure: unknown) => { if (active && version === verificationVersion.current) setOtpError(failure instanceof Error ? failure.message : 'Unable to check email verification.'); });
    })().catch((error: unknown) => {
      if (!active) return;
      scrubAuthCallback();
      if (authCallback.present || setup.current) {
        setAuthCallbackError(callbackFailure(setup.current?.kind ?? authCallback.action));
        setup.current = null;
        storePasswordSetup(null);
        setPasswordRecoveryRequired(false);
        setInvitationSetupRequired(false);
      }
      setLoading(false);
      setOtpError(error instanceof Error ? error.message : 'Unable to restore your session.');
    }).finally(() => { if (active) setCheckingCallback(false); });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      const changed = currentSession.current && newSession && !sameAuthSession(currentSession.current, newSession);
      if (changed) {
        invalidateSessionRequests();
        verificationVersion.current += 1;
        setOtpVerified(false);
        setPendingOtpUserId(null);
        setPendingOtpEmail(null);
        callbackAccount.current = null;
        setup.current = null;
        storePasswordSetup(null);
        recoveryMode.current = false;
        invitationMode.current = false;
        setPasswordRecoveryRequired(false);
        setInvitationSetupRequired(false);
        resetOtpChallenge();
      }
      currentSession.current = newSession;
      currentUserId.current = newSession?.user.id ?? null;
      setSession(newSession);
      if (!newSession) {
        invalidateSessionRequests();
        accountOtpEmail.current = null;
        verificationVersion.current += 1;
        setPendingOtpUserId(null);
        setPendingOtpEmail(null);
        setProfile(null);
        setOtpVerified(false);
        setLoading(false);
        resetOtpChallenge();
        if (event === 'SIGNED_OUT') {
          setAuthCallbackRetry(false);
          callbackAccount.current = null;
          setup.current = null;
          storePasswordSetup(null);
          recoveryMode.current = false;
          invitationMode.current = false;
          setPasswordRecoveryRequired(false);
          setInvitationSetupRequired(false);
        }
      }
    });

    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [applyOtpChallenge, applyOtpRetry, resetOtpChallenge]);

  useEffect(() => {
    let cancelled = false;
    if (!authenticatedUserId) {
      setProfile(null);
      return;
    }
    if (checkingCallback || callbackAccount.current === authenticatedUserId || setup.current?.userId === authenticatedUserId) return;
    const expectedSession = currentSession.current;
    const version = sessionRequestVersion();
    const attempt = signInAttempt.current;
    const isCurrentSession = () => !cancelled && attempt === signInAttempt.current
      && sameAuthSession(expectedSession, currentSession.current);
    const isCurrent = () => version === sessionRequestVersion() && isCurrentSession();
    setLoading(true);
    (async () => {
      try {
        const { data } = await apiRequest<{ data: Profile }>('/auth/profile');
        // OTP completion invalidates older verification requests, but a valid
        // profile for this unchanged login must still finish restoring it.
        if (!isCurrentSession()) return;
        setProfile(data);
        accountOtpEmail.current = maskOtpEmail(data.email);
        setPendingOtpEmail(accountOtpEmail.current);
      } catch (error) {
        if (!isCurrent()) return;
        setProfile(null);
        setOtpError(error instanceof Error ? error.message : 'Unable to load your account profile.');
      } finally {
        if (isCurrentSession()) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authenticatedUserId, authenticatedSessionId, checkingCallback]);

  const signIn: AuthState['signIn'] = async (email, password, role) => {
    const attempt = ++signInAttempt.current;
    invalidateSessionRequests();
    suspensionShown.current = false;
    setAccountSuspended(false);
    setAuthCallbackError('');
    setAuthCallbackNotice('');
    setAuthCallbackRetry(false);
    setOtpNotice('');
    resetOtpChallenge();
    setSignInHint(null);
    verificationVersion.current += 1;
    setOtpVerified(false);
    setProfile(null);
    setPendingOtpUserId(null);
    setPendingOtpEmail(null);
    accountOtpEmail.current = null;
    setOtpError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (attempt !== signInAttempt.current) return { error: null };
    if (error) {
      if (error.code === 'user_banned') {
        suspendAccount();
        return { error: 'Your account has been suspended' };
      }
      return { error: error.message };
    }

    const userId = data.user.id;
    // SIGNED_IN can legitimately replace the SDK session and increment the
    // request generation. Capture that generation after credentials succeed.
    const expectedSession = data.session;
    const version = sessionRequestVersion();
    const isCurrent = () => attempt === signInAttempt.current && version === sessionRequestVersion()
      && sameAuthSession(expectedSession, currentSession.current);
    if (!isCurrent()) return { error: null };

    let profileData: Profile;
    try {
      ({ data: profileData } = await apiRequest<{ data: Profile }>('/auth/profile'));
    } catch (error) {
      if (!isCurrent()) return { error: null };
      if (error instanceof ApiError && error.status === 403 && error.code === 'ACCOUNT_DISABLED') {
        return { error: 'Your account has been suspended' };
      }
      if (!retryableProfileFailure(error)) await supabase.auth.signOut();
      return { error: error instanceof Error ? error.message : 'Unable to load your account profile.' };
    }
    if (!isCurrent()) return { error: null };
    if (profileData.id !== userId) {
      await supabase.auth.signOut();
      return { error: 'This account could not be verified. Contact the clinic administrator.' };
    }

    const accountRole = ['student', 'lecturer', 'staff'].includes(profileData.role) ? 'patient' : profileData.role;
    if (accountRole !== role) {
      await supabase.auth.signOut();
      return { error: `This account is registered as a ${(profileData as { role: string }).role}, not as a ${role}.` };
    }

    // The authenticated profile supplies the destination; the login form cannot override it.
    const accountEmail = profileData.email?.trim();
    if (!accountEmail) {
      await supabase.auth.signOut();
      return { error: 'No email address on file. Contact the administrator to set up email verification.' };
    }

    setProfile(profileData);
    setPendingOtpUserId(userId);
    accountOtpEmail.current = maskOtpEmail(accountEmail);
    setPendingOtpEmail(accountOtpEmail.current);
    // Preserve the authenticated session on delivery failure so the user can
    // see the reason and retry, without being bounced back to credentials.
    const { error: deliveryError } = await sendOtp();
    if (deliveryError) return { error: deliveryError };
    return { error: null };
  };

  const signUp: AuthState['signUp'] = async (params) => {
    try {
      const { message } = await apiRequest<{ message: string }>('/auth/register', {
        method: 'POST', body: JSON.stringify({
          email: params.email, password: params.password, fullName: params.fullName,
          phone: params.phone, userType: params.userType,
          studentNumber: params.studentNumber, staffNumber: params.staffNumber,
          department: params.department, program: params.program,
          addressLine1: params.addressLine1, addressLine2: params.addressLine2,
          addressLatitude: params.addressLatitude, addressLongitude: params.addressLongitude, addressSource: params.addressSource,
          city: params.city, province: params.province, postalCode: params.postalCode,
        }),
      });
      return { error: null, message };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to create your account.' };
    }
  };

  const sendOtp: AuthState['sendOtp'] = async () => {
    const expectedSession = currentSession.current;
    const version = sessionRequestVersion();
    const isCurrent = () => version === sessionRequestVersion() && sameAuthSession(expectedSession, currentSession.current);
    setOtpSending(true);
    try {
      const result = await apiRequest<{ message?: string; deliveryMode?: 'email'; retryAfterSeconds?: number } & OtpChallengeMetadata>('/auth/otp/send', { method: 'POST' });
      if (!isCurrent()) return { error: null };
      verificationVersion.current += 1;
      applyOtpChallenge(result);
      applyOtpRetry(result.retryAfterSeconds);
      setOtpNotice(result.message || 'A verification code was sent to your account email.');
      setOtpError('');
      return { error: null };
    } catch (error) {
      if (!isCurrent()) return { error: null };
      if (error instanceof ApiError) {
        applyOtpRetry(error.retryAfterSeconds);
        if (error.activeChallenge !== undefined) {
          verificationVersion.current += 1;
          if (error.activeChallenge) applyOtpChallenge(error.activeChallenge);
          else {
            setOtpChallengeReady(false);
            setOtpExpiresAt(null);
            setOtpNotice('');
          }
        }
      }
      const message = error instanceof Error ? error.message : 'Unable to send verification code.';
      setOtpError(message);
      return { error: message };
    } finally { if (isCurrent()) setOtpSending(false); }
  };

  const requestPasswordReset: AuthState['requestPasswordReset'] = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/?auth_action=recovery`,
      });
      if (!error) setAuthCallbackError('');
      return { error: error?.message ?? null };
    } catch { return { error: 'Unable to send the password reset link. Please try again.' }; }
  };

  const completePasswordRecovery: AuthState['completePasswordRecovery'] = async (password) => {
    const intent = setup.current;
    const expected = currentSession.current;
    if (!session || !expected || !intent || profile?.id !== intent.userId
      || !sameAuthSession(session, expected) || intent.userId !== expected.user.id
      || intent.sessionId !== authSessionId(expected.access_token)
      || !(recoveryMode.current || invitationMode.current)) {
      return { error: 'Your account setup session has changed or expired. Open the latest account email link again.' };
    }
    try {
      if (intent.kind === 'invite') {
        await apiRequest('/auth/invitation/complete', { method: 'POST', body: JSON.stringify({ password }), signal: AbortSignal.timeout(12000) });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return { error: error.message };
      }
      if (!sameAuthSession(expected, currentSession.current)) return { error: 'Your session changed. Sign in again with the password for your account.' };
    } catch (error) { return { error: error instanceof ApiError ? error.message : error instanceof Error && ['AbortError','TimeoutError'].includes(error.name) ? AUTH_TIMEOUT_MESSAGE : 'Unable to update your password. Check your connection and try again.' }; }
    storePasswordSetup(null);
    setup.current = null;
    recoveryMode.current = false;
    invitationMode.current = false;
    setSignInHint({ email: profile.email, role: ['student', 'lecturer', 'staff'].includes(profile.role) ? 'patient' : profile.role });
    return { error: null };
  };

  const verifyOtp: AuthState['verifyOtp'] = async (userId, code) => {
    if (userId !== session?.user.id) return { error: 'Your session changed. Please sign in again.' };
    const expectedSession = currentSession.current;
    const version = sessionRequestVersion();
    const isCurrent = () => version === sessionRequestVersion() && sameAuthSession(expectedSession, currentSession.current);
    try {
      await apiRequest('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      if (!isCurrent()) return { error: null };

      // A restoration request may still be in flight. Its older result must
      // not revoke verification that just succeeded for this session.
      invalidateSessionRequests();
      verificationVersion.current += 1;
      setPendingOtpUserId(null);
      setPendingOtpEmail(null);
      setOtpVerified(true);
      resetOtpChallenge();
      setOtpError('');
      return { error: null };
    } catch (error) {
      if (!isCurrent()) return { error: null };
      if (error instanceof ApiError && [404, 410, 429].includes(error.status)) {
        setOtpChallengeReady(false);
        setOtpExpiresAt(error.status === 410 ? Date.now() : null);
      }
      return { error: error instanceof Error ? error.message : 'Unable to verify this code.' };
    }
  };

  const cancelOtp: AuthState['cancelOtp'] = async () => {
    signInAttempt.current += 1;
    invalidateSessionRequests();
    const expectedSession = currentSession.current;
    const attempt = signInAttempt.current;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (attempt !== signInAttempt.current || (currentSession.current && !sameAuthSession(expectedSession, currentSession.current))) return;
    if (error) {
      clearStoredAuthSession();
      currentSession.current = null;
      currentUserId.current = null;
      setSession(null);
      setProfile(null);
    }
    setPendingOtpUserId(null);
    setPendingOtpEmail(null);
    setOtpVerified(false);
    setOtpError('');
    setOtpNotice('');
    resetOtpChallenge();
  };

  const signOut: AuthState['signOut'] = async () => {
    signInAttempt.current += 1;
    invalidateSessionRequests();
    const expectedSession = currentSession.current;
    const attempt = signInAttempt.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try { await apiRequest('/auth/logout', { method: 'POST', signal: controller.signal }).catch(() => undefined); }
    finally { window.clearTimeout(timeout); }
    if (attempt !== signInAttempt.current || (currentSession.current && !sameAuthSession(expectedSession, currentSession.current))) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (attempt !== signInAttempt.current || (currentSession.current && !sameAuthSession(expectedSession, currentSession.current))) return;
    if (error) clearStoredAuthSession();
    currentSession.current = null;
    currentUserId.current = null;
    setSession(null);
    setProfile(null);
    setPendingOtpUserId(null);
    setPendingOtpEmail(null);
    setOtpVerified(false);
    setOtpNotice('');
    setOtpError('');
    resetOtpChallenge();
    setPasswordRecoveryRequired(false);
    setInvitationSetupRequired(false);
    recoveryMode.current = false;
    invitationMode.current = false;
    storePasswordSetup(null);
    setup.current = null;
  };

  return (
    <AuthContext.Provider value={{
      session, profile, loading: loading || checkingCallback, otpVerified, passwordRecoveryRequired, invitationSetupRequired, authCallbackError, authCallbackNotice, authCallbackRetry, accountSuspended, refreshProfile,
      pendingOtpUserId, pendingOtpEmail, otpError, otpNotice, otpSending, otpChallengeReady, otpExpiresAt, otpRetryAt, signInHint,
      signIn, signUp, sendOtp, requestPasswordReset, completePasswordRecovery, verifyOtp, cancelOtp, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
