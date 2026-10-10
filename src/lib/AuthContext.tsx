import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile, type Role } from './supabase';
import { apiRequest } from './api';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  otpVerified: boolean;
  pendingOtpUserId: string | null;
  pendingOtpPhone: string | null;
  otpError: string;
  passwordRecoveryRequired: boolean;
  invitationSetupRequired: boolean;
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
    addressLine2?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    nextOfKinName?: string;
    nextOfKinRelationship?: string;
    nextOfKinPhone?: string;
  }) => Promise<{ error: string | null }>;
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
  const [pendingOtpPhone, setPendingOtpPhone] = useState<string | null>(null);
  const [otpError, setOtpError] = useState('');
  const startupOtpToken = useRef<string | null>(null);
  const recoveryMode = useRef(window.location.hash.includes('type=recovery'));
  const invitationMode = useRef(window.location.hash.includes('type=invite'));
  const [passwordRecoveryRequired, setPasswordRecoveryRequired] = useState(recoveryMode.current);
  const [invitationSetupRequired, setInvitationSetupRequired] = useState(invitationMode.current);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setLoading(false);
        return;
      }
      if (recoveryMode.current || invitationMode.current) {
        setPasswordRecoveryRequired(recoveryMode.current);
        setInvitationSetupRequired(invitationMode.current);
        return;
      }
      if (startupOtpToken.current === data.session.access_token) return;
      startupOtpToken.current = data.session.access_token;
      setPendingOtpUserId(data.session.user.id);
      void apiRequest('/auth/otp/send', { method: 'POST' })
        .then(() => setOtpError(''))
        .catch((error: unknown) => setOtpError(error instanceof Error ? error.message : 'Unable to send verification code.'));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode.current = true;
        setPasswordRecoveryRequired(true);
        setPendingOtpUserId(null);
        setPendingOtpPhone(null);
        setOtpVerified(false);
      }
      if (!newSession) {
        setProfile(null);
        setOtpVerified(false);
        setLoading(false);
        if (event === 'SIGNED_OUT') {
          recoveryMode.current = false;
          invitationMode.current = false;
          setPasswordRecoveryRequired(false);
          setInvitationSetupRequired(false);
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) {
        setProfile(null);
      } else {
        setProfile(data as Profile | null);
      }
      setLoading(false);
    })();
  }, [session]);

  const signIn: AuthState['signIn'] = async (email, password, role) => {
    setOtpVerified(false);
    setOtpError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    const userId = data.user.id;

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role, phone')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profileData) {
      await supabase.auth.signOut();
      return { error: 'No profile found for this account. Please register first.' };
    }

    if ((profileData as { role: string }).role !== role) {
      await supabase.auth.signOut();
      return { error: `This account is registered as a ${(profileData as { role: string }).role}, not as a ${role}.` };
    }

    // OTP step: send code to the user's phone
    const phone = (profileData as { phone: string | null }).phone;
    if (!phone) {
      await supabase.auth.signOut();
      return { error: 'No phone number on file. Please contact the administrator to set up two-factor verification.' };
    }

    const { error: otpError } = await sendOtp();
    if (otpError) {
      await supabase.auth.signOut();
      setPendingOtpUserId(null);
      setPendingOtpPhone(null);
      return { error: otpError };
    }

    setPendingOtpUserId(userId);
    setPendingOtpPhone(phone);
    setOtpError('');
    return { error: null };
  };

  const signUp: AuthState['signUp'] = async (params) => {
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          full_name: params.fullName || null,
          phone: params.phone || null,
          user_type: params.userType || null,
          student_category: params.studentCategory || null,
          student_number: params.studentNumber || null,
          staff_number: params.staffNumber || null,
          department: params.department || null,
          program: params.program || null,
          address_line1: params.addressLine1 || null,
          address_line2: params.addressLine2 || null,
          city: params.city || null,
          province: params.province || null,
          postal_code: params.postalCode || null,
          next_of_kin_name: params.nextOfKinName || null,
          next_of_kin_relationship: params.nextOfKinRelationship || null,
          next_of_kin_phone: params.nextOfKinPhone || null,
        },
      },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Account creation failed. Please try again.' };

    return { error: null };
  };

  const sendOtp: AuthState['sendOtp'] = async () => {
    try {
      await apiRequest('/auth/otp/send', { method: 'POST' });
      setOtpError('');
      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send verification code.';
      setOtpError(message);
      return { error: message };
    }
  };

  const requestPasswordReset: AuthState['requestPasswordReset'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error: error?.message ?? null };
  };

  const completePasswordRecovery: AuthState['completePasswordRecovery'] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    recoveryMode.current = false;
    invitationMode.current = false;
    return { error: null };
  };

  const verifyOtp: AuthState['verifyOtp'] = async (userId, code) => {
    try {
      await apiRequest('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      setPendingOtpUserId(null);
      setPendingOtpPhone(null);
      setOtpVerified(true);
      setOtpError('');
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to verify this code.' };
    }
  };

  const cancelOtp: AuthState['cancelOtp'] = async () => {
    await supabase.auth.signOut();
    setPendingOtpUserId(null);
    setPendingOtpPhone(null);
    setOtpVerified(false);
    setOtpError('');
  };

  const signOut: AuthState['signOut'] = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPendingOtpUserId(null);
    setPendingOtpPhone(null);
    setOtpVerified(false);
    setPasswordRecoveryRequired(false);
    setInvitationSetupRequired(false);
    recoveryMode.current = false;
  };

  return (
    <AuthContext.Provider value={{
      session, profile, loading, otpVerified, passwordRecoveryRequired, invitationSetupRequired,
      pendingOtpUserId, pendingOtpPhone, otpError,
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
