import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import crypto from 'crypto';

// Request ID middleware for tracing
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// Request sanitization middleware
export function sanitizeRequest(req: Request, res: Response, next: NextFunction) {
  // Remove potential XSS vectors from query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = (req.query[key] as string)
          .replace(/[<>]/g, '')
          .trim();
      }
    }
  }

  // Log suspicious requests
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];

  const bodyString = JSON.stringify(req.body);
  const queryString = JSON.stringify(req.query);

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(bodyString) || pattern.test(queryString)) {
      logger.warn('Suspicious request detected', {
        requestId: req.id,
        ip: req.ip,
        path: req.path,
        pattern: pattern.source
      });
      return res.status(400).json({ error: 'Invalid request content' });
    }
  }

  next();
}

// Request size validation
export function validateRequestSize(req: Request, res: Response, next: NextFunction) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 32 * 1024; // 32KB

  if (contentLength > maxSize) {
    logger.warn('Request size exceeded', {
      requestId: req.id,
      size: contentLength,
      maxSize
    });
    return res.status(413).json({ error: 'Request entity too large' });
  }

  next();
}

// Content type validation
export function validateContentType(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    // Only validate content-type if there's a body
    if (contentLength > 0) {
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Invalid content type', {
          requestId: req.id,
          contentType,
          method: req.method
        });
        return res.status(415).json({ error: 'Unsupported Media Type' });
      }
    }
  }

  next();
}

// IP whitelist middleware (optional)
export function ipWhitelist(allowedIPs: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      logger.warn('IP not in whitelist', {
        requestId: req.id,
        ip: clientIP
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
}

// Request timeout middleware
export function requestTimeout(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      logger.warn('Request timeout', {
        requestId: req.id,
        path: req.path,
        timeout: timeoutMs
      });
      if (!res.headersSent) {
        res.status(504).json({ error: 'Request timeout' });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

// Extend Express Request type
declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}