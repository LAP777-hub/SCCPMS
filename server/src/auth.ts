import { createClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';

export type AppRole = 'admin' | 'doctor' | 'patient' | 'receptionist' | 'student' | 'lecturer' | 'staff';

export type AuthContext = {
  userId: string;
  sessionId: string;
  role: AppRole;
  email: string;
  phone: string | null;
  profile: Record<string, unknown>;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

const roleSet = new Set<AppRole>(['admin', 'doctor', 'patient', 'receptionist', 'student', 'lecturer', 'staff']);
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    logger.warn('Authentication failed: No token provided');
    return res.status(401).json({ error: 'Sign in is required.' });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      logger.warn('Authentication failed: Invalid or expired token');
      return res.status(401).json({ error: 'Your session is invalid or expired.' });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || !roleSet.has(profile.role as AppRole)) {
      logger.warn('Authentication failed: Invalid profile', { userId: user.id });
      return res.status(403).json({ error: 'A valid account profile is required.' });
    }

    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { session_id?: string };
    if (!claims.session_id) {
      logger.warn('Authentication failed: Missing session claims', { userId: user.id });
      return res.status(401).json({ error: 'The session is missing required claims.' });
    }

    req.auth = {
      userId: user.id,
      sessionId: claims.session_id,
      role: profile.role as AppRole,
      email: user.email ?? profile.email,
      phone: profile.phone,
      profile: profile as Record<string, unknown>,
    };
    
    logger.debug('Authentication successful', { userId: user.id, role: profile.role });
    return next();
  } catch (error) {
    logger.error('Authentication error', { error });
    return res.status(503).json({ error: 'Unable to validate your session right now.' });
  }
}

export async function requireOtp(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Sign in is required.' });
  try {
    const result = await pool.query(
      `SELECT 1 FROM otp_verified_sessions
       WHERE user_id = $1 AND session_id = $2 AND expires_at > now()`,
      [req.auth.userId, req.auth.sessionId],
    );
    if (!result.rowCount) {
      logger.warn('OTP verification failed: No valid OTP session', { userId: req.auth.userId });
      return res.status(428).json({ error: 'OTP verification is required.', code: 'OTP_REQUIRED' });
    }
    logger.debug('OTP verification successful', { userId: req.auth.userId });
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