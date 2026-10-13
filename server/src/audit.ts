import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';
import { logger } from './logger.js';
import { keepRequestWork } from './runtime.js';

// No bodies, tokens, OTP values, or clinical text are written to access logs.
export function auditAccess(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/auth/')) return next();
  const path = req.originalUrl.split('?')[0];
  res.once('finish', () => {
    keepRequestWork(pool
      .query(
        `INSERT INTO request_audit_logs (actor_user_id,request_id,method,path,status_code,duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.auth?.userId ?? null, req.id, req.method, path, res.statusCode, Date.now() - started]
      )
      .catch((error) =>
        logger.error('Unable to persist API access audit', error, { requestId: req.id })
      ));
  });
  next();
}
