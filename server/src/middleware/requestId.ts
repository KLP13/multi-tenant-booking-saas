import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pino from 'pino';
import { logger } from '../lib/logger';

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: pino.Logger;
    }
  }
}

/**
 * Middleware that assigns or forwards an X-Request-ID,
 * attaches a scoped Pino child logger to req.log,
 * and records response latency and HTTP status code.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawId = req.headers['x-request-id'];
  let reqId: string;

  if (typeof rawId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(rawId)) {
    reqId = rawId;
  } else {
    reqId = crypto.randomUUID();
  }

  req.id = reqId;
  res.setHeader('X-Request-ID', reqId);

  // Scoped child logger carrying this specific request context
  req.log = logger.child({ reqId });

  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ip: req.ip || req.socket.remoteAddress,
    };

    if (statusCode >= 500) {
      req.log.error(logData, `HTTP ${req.method} ${req.originalUrl || req.url} ${statusCode} (${durationMs}ms)`);
    } else if (statusCode >= 400) {
      req.log.warn(logData, `HTTP ${req.method} ${req.originalUrl || req.url} ${statusCode} (${durationMs}ms)`);
    } else {
      req.log.info(logData, `HTTP ${req.method} ${req.originalUrl || req.url} ${statusCode} (${durationMs}ms)`);
    }
  });

  next();
}
