import { createClient, isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError, type AuthError } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { accountEmailSchema } from './university-policy.js';
import { otpEmailHash } from './otp-security.js';

export type AppRole = 'admin' | 'doctor' | 'patient' | 'receptionist' | 'student' | 'lecturer' | 'staff';

export type AuthContext = {
  userId: string;
  sessionId: string;
  role: AppRole;
  email: string;
  phone: string | null;
  profile: Record<string, unknown>;
  invitedAt?: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    otpValidated?: boolean;
  }
}

const roleSet = new Set<AppRole>(['admin', 'doctor', 'patient', 'receptionist', 'student', 'lecturer', 'staff']);
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function invalidAuthSession(error: AuthError): boolean {
  if (isAuthRetryableFetchError(error) || error.status === 429 || (error.status ?? 0) >= 500 ||
      ['request_timeout', 'unexpected_failure', 'over_request_rate_limit', 'conflict'].includes(error.code ?? '')) return false;
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthApiError(error)) return false;
  // Current providers identify invalid sessions by code; older Auth responses
  // can return only 401/403. Other failures do not prove the token is invalid.
  return ['bad_jwt', 'session_expired', 'session_not_found', 'user_not_found', 'no_authorization'].includes(error.code ?? '') ||
    (!error.code && [401, 403].includes(error.status));
}

export function sessionIdFromAccessToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { session_id?: unknown };
    return typeof claims.session_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id) ? claims.session_id : null;
  } catch { return null; }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.auth) return next();
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    logger.warn('Authentication failed: No token provided');
    return res.status(401).json({ error: 'Sign in is required.', code: 'SESSION_INVALID' });
  }

  let validationStage: 'token-validation' | 'profile-lookup' | 'account-status' = 'token-validation';
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error && isAuthApiError(error) && error.code === 'user_banned' && [400, 401, 403].includes(error.status)) {
      return res.status(403).json({ error: 'Your account has been suspended. Contact admin: luckypinga077@gmail.com.', code: 'ACCOUNT_DISABLED' });
    }
    if (error && !invalidAuthSession(error)) {
      logger.warn('Authentication validation unavailable', { stage: validationStage, status: error.status });
      return res.status(503).json({ error: 'Unable to validate your session right now.' });
    }
    if (error || !user) {
      logger.warn('Authentication failed: Invalid or expired token');
      return res.status(401).json({ error: 'Your session is invalid or expired.', code: 'SESSION_INVALID' });
    }
    if (!user.email_confirmed_at) {
      return res.status(403).json({ error: 'Confirm your email address before accessing the clinic.', code: 'EMAIL_CONFIRMATION_REQUIRED' });
    }

    validationStage = 'profile-lookup';
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    const trustedRole = user.app_metadata.clinic_role as AppRole;
    if (profileError) {
      logger.warn('Authentication profile lookup unavailable', { stage: validationStage, userId: user.id });
      return res.status(503).json({ error: 'Unable to validate your session right now.' });
    }
    if (!profile || !roleSet.has(trustedRole)) {
      const missingRole = !Object.hasOwn(user.app_metadata, 'clinic_role');
      const invitedAt = typeof user.invited_at === 'string' ? Date.parse(user.invited_at) : NaN;
      const inviteAge = Date.now() - invitedAt;
      // Invite delivery can win the race against profile/claim provisioning.
      // Only the provider's confirmed, recently invited account gets a retry;
      // an explicit unsupported role remains a permanent rejection.
      if ((missingRole || roleSet.has(trustedRole)) && Number.isFinite(inviteAge) && inviteAge >= 0 && inviteAge <= 120000) {
        return res.status(503).json({ error: 'Your invited account is still being prepared. Retry shortly.', code: 'ACCOUNT_SETUP_PENDING', retryAfterSeconds: 1 });
      }
      logger.warn('Authentication failed: Invalid profile', { userId: user.id });
      return res.status(403).json({ error: 'A valid account profile is required.' });
    }
    if (!accountEmailSchema.safeParse(user.email).success) {
      return res.status(403).json({ error: 'A valid confirmed email address is required to access the clinic.' });
    }

    validationStage = 'account-status';
    const account = await pool.query('SELECT active FROM account_status WHERE user_id = $1', [user.id]);
    if (account.rows[0]?.active === false) {
      return res.status(403).json({ error: 'Your account has been suspended. Contact admin: luckypinga077@gmail.com.', code: 'ACCOUNT_DISABLED' });
    }

    const sessionId = sessionIdFromAccessToken(token);
    if (!sessionId) {
      logger.warn('Authentication failed: Missing session claims', { userId: user.id });
      return res.status(401).json({ error: 'The session is missing required claims.', code: 'SESSION_INVALID' });
    }

    req.auth = {
      ...(typeof user.invited_at === 'string' ? { invitedAt: user.invited_at } : {}),
      userId: user.id,
      sessionId,
      role: trustedRole,
      email: user.email ?? profile.email,
      phone: typeof user.app_metadata.clinic_phone === 'string' ? user.app_metadata.clinic_phone : null,
      profile: { ...profile, role: trustedRole, email: user.email ?? profile.email, phone: user.app_metadata.clinic_phone ?? null },
    };
    
    logger.debug('Authentication successful', { userId: user.id, role: trustedRole });
    return next();
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : undefined;
    logger.error('Authentication validation unavailable', undefined, {
      stage: validationStage,
      reason: error instanceof Error && /timeout|timed out/i.test(error.message) ? 'timeout' : 'dependency-failure',
      ...(errorCode ? { errorCode } : {}),
    });
    return res.status(503).json({ error: 'Unable to validate your session right now.' });
  }
}

export async function requireOtp(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Sign in is required.' });
  if (req.otpValidated) return next();
  try {
    const result = await pool.query(
      `SELECT 1 FROM otp_verified_sessions
       WHERE user_id = $1 AND session_id = $2 AND email_hash = $3 AND expires_at > now()`,
      [req.auth.userId, req.auth.sessionId, otpEmailHash(req.auth.userId, req.auth.email)],
    );
    if (!result.rowCount) {
      logger.warn('OTP verification failed: No valid OTP session', { userId: req.auth.userId });
      return res.status(428).json({ error: 'OTP verification is required.', code: 'OTP_REQUIRED' });
    }
    logger.debug('OTP verification successful', { userId: req.auth.userId });
    req.otpValidated = true;
    return next();
  } catch (error) {
    logger.error('OTP verification error', { userId: req.auth.userId, error });
    return res.status(503).json({ error: 'Unable to verify your authentication state.' });
  }
}

export function allowRoles(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      logger.warn('Authorization failed: Invalid role', { 
        userId: req.auth?.userId, 
        role: req.auth?.role, 
        requiredRoles: roles 
      });
      return res.status(403).json({ error: 'Your role is not permitted to perform this action.' });
    }
    logger.debug('Authorization successful', { userId: req.auth.userId, role: req.auth.role });
    return next();
  };
}
