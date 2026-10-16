import express from 'express';
import accountRecordsRouter from './account-records.routes.js';
import cors from 'cors';
import * as helmetPackage from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import {
  requestId,
  sanitizeRequest,
  validateRequestSize,
  validateContentType,
  securityHeaders,
  requestTimeout
} from './security.js';
import otpRouter from './otp.routes.js';
import apiRouter from './api.routes.js';
import schedulingRouter from './scheduling.routes.js';
import clinicalRouter from './clinical.routes.js';
import authRouter from './auth.routes.js';
import addressRouter from './address.routes.js';
import eventsRouter from './events.routes.js';
import analyticsRouter from './analytics.routes.js';
import adminOverviewRouter from './admin-overview.routes.js';
import profilePhotoRouter from './profile-photo.routes.js';
import { auditAccess } from './audit.js';
import { requireAuth, requireOtp } from './auth.js';
import { RateLimitStorageUnavailable, sharedRateLimitStore } from './rate-limit-store.js';

const app = express();
app.disable('x-powered-by');

// Trust proxy for rate limiting behind nginx/reverse proxy
app.set('trust proxy', config.TRUST_PROXY);

// Enhanced security headers with Helmet
app.use(helmetPackage.default({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xFrameOptions: { action: 'sameorigin' },
  referrerPolicy: { policy: 'no-referrer-when-downgrade' }
}));

// CORS configuration
app.use(cors({
  origin: config.FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Rate limiting for different endpoints
const generalLimiter = rateLimit({
  store: sharedRateLimitStore('clinic-read'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Includes dashboard synchronization reads.
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please retry shortly.' },
  keyGenerator: req => req.auth!.userId
});

const strictLimiter = rateLimit({
  store: sharedRateLimitStore('clinic-write'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Per operator, including front-desk registration work.
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account changes. Please retry shortly.' },
  keyGenerator: req => req.auth!.userId,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
});

// Body size limits
app.use(requestId);
app.use(auditAccess);
app.use('/auth/otp', requireAuth, rateLimit({ store: sharedRateLimitStore('otp'), windowMs: 15 * 60 * 1000, limit: 20, keyGenerator:req=>req.auth!.userId, standardHeaders: true, legacyHeaders: false, skip: (req) => req.method === 'GET', message: { error: 'Too many verification requests. Retry later.' } }));
app.use('/auth/register', rateLimit({ store: sharedRateLimitStore('registration'), windowMs: 60 * 60 * 1000, limit: 250, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many registrations. Retry later.' } }));
app.use('/auth/invitation/complete', requireAuth, rateLimit({ store: sharedRateLimitStore('invitation-acceptance'), windowMs: 15*60*1000, limit: 10, keyGenerator: req => req.auth!.userId, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many password setup attempts. Retry later.' } }));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// Security middleware
app.use(securityHeaders);
app.use(validateRequestSize);
app.use(validateContentType);
app.use(sanitizeRequest);
app.use((req, res, next) => req.path === '/api/events' ? next() : requestTimeout(30000)(req, res, next));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req.method, req.path, res.statusCode, duration, req.id);
  });
  logger.debug('Incoming request', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', timestamp: new Date().toISOString(), requestId: req.id });
  } catch (error) {
    logger.error('Health check failed', { requestId: req.id, error });
    return res.status(503).json({ status: 'unavailable', dependency: 'database', timestamp: new Date().toISOString(), requestId: req.id });
  }
});

// Metrics endpoint for monitoring
app.get('/', (_req, res) => res.json({ service: 'SCCPMS API', health: '/healthz' }));

app.get('/metrics', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW() as current_time');
    const uptime = process.uptime();

    return res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
      database: {
        connected: true,
        current_time: dbCheck.rows[0].current_time
      },
      environment: config.NODE_ENV,
      requestId: req.id
    });
  } catch (error) {
    logger.error('Metrics check failed', { requestId: req.id, error });
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: { connected: false },
      requestId: req.id
    });
  }
});

app.use('/auth/otp', otpRouter);
app.use('/auth', authRouter);
// Available before account creation; independently throttled, bounded and cached.
app.use('/registration', addressRouter);
app.use('/api/events', eventsRouter);
app.use('/api', requireAuth, requireOtp, generalLimiter);
app.use('/api/patients', strictLimiter);
app.use('/api/staff', strictLimiter);
app.use('/api/account-records', strictLimiter);
app.use('/api/profile', strictLimiter, profilePhotoRouter);
app.use('/api', accountRecordsRouter);
app.use('/api', analyticsRouter);
app.use('/api', adminOverviewRouter);
app.use('/api', apiRouter);
app.use('/api', schedulingRouter);
app.use('/api', clinicalRouter);
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  if (error instanceof RateLimitStorageUnavailable) return res.status(503).json({ error: error.message });
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 413) return res.status(status).json({ error: status === 413 ? 'Request body is too large.' : 'Provide a valid JSON request body.', requestId: req.id });
  logger.error('Unhandled API error', { requestId: req.id, path: req.path, error });
  return res.status(500).json({
    error: 'An unexpected server error occurred.',
    requestId: req.id
  });
});

export default app;
