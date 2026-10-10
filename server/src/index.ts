import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

const app = express();
app.disable('x-powered-by');

// Trust proxy for rate limiting behind nginx/reverse proxy
app.set('trust proxy', true);

// Enhanced security headers with Helmet
app.use(helmet({
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
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'], 
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Rate limiting for different endpoints
const generalLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window
  standardHeaders: true, 
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

const strictLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // 20 requests per window
  standardHeaders: true, 
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/auth/otp', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use('/api', generalLimiter);
app.use('/api/patients', strictLimiter);
app.use('/api/staff', strictLimiter);

// Body size limits
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// Security middleware
app.use(requestId);
app.use(securityHeaders);
app.use(validateRequestSize);
app.use(validateContentType);
app.use(sanitizeRequest);
app.use(requestTimeout(30000)); // 30 second timeout

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
app.use('/api', apiRouter);
app.use('/api', schedulingRouter);
app.use('/api', clinicalRouter);
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  logger.error('Unhandled API error', { requestId: req.id, path: req.path, error });
  return res.status(500).json({ 
    error: 'An unexpected server error occurred.',
    requestId: req.id 
  });
});

const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info(`SCCPMS API server started`, { 
    port: config.PORT, 
    environment: config.NODE_ENV,
    frontend_origin: config.FRONTEND_ORIGIN 
  });
});

async function shutdown() {
  logger.info('Shutting down server gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
  });
  await pool.end();
  logger.info('Database connection pool closed');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);