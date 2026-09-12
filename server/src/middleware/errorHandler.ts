import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config/env';
import { logger } from '../lib/logger';

export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: any;

  constructor(statusCode: number, message: string, code?: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RateLimitError extends AppError {
  retryAfter?: number;

  constructor(message = 'Too many requests. Please try again later.', retryAfter?: number) {
    super(429, message, 'RATE_LIMITED');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class UpstreamServiceError extends AppError {
  service: string;

  constructor(service: string, message: string, statusCode = 502, code = 'UPSTREAM_SERVICE_ERROR') {
    super(statusCode, `Upstream ${service} error: ${message}`, code);
    this.name = 'UpstreamServiceError';
    this.service = service;
  }
}

/**
 * Helper to create typed errors with status codes and machine-readable error codes.
 * Usage: throw createError(404, 'Resource not found', 'RESOURCE_NOT_FOUND')
 */
export function createError(statusCode: number, message: string, code?: string, details?: any): AppError {
  return new AppError(statusCode, message, code, details);
}

/**
 * Centralized error handler — must be the last middleware registered in index.ts.
 * Catches all errors thrown or passed via next(err).
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const reqId = req.id || 'unknown';
  const reqLogger = req.log || logger;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Prisma ORM Errors
  // ─────────────────────────────────────────────────────────────────────────────
  if (err.name === 'PrismaClientKnownRequestError' || err.code?.startsWith('P20')) {
    const prismaCode = err.code as string;

    if (prismaCode === 'P2002') {
      // Unique constraint failed
      const targets = (err.meta?.target as string[] | undefined) || [];
      const fieldName = targets.length > 0 ? targets.join(', ') : 'field';
      const userMessage = `A record with this ${fieldName} already exists`;

      reqLogger.warn({ reqId, prismaCode, targets }, userMessage);
      res.status(409).json({
        error: userMessage,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        field: fieldName,
        requestId: reqId,
      });
      return;
    }

    if (prismaCode === 'P2025') {
      // Record not found
      const userMessage = (err.meta?.cause as string) || 'The requested record was not found';
      reqLogger.warn({ reqId, prismaCode }, userMessage);
      res.status(404).json({
        error: userMessage,
        code: 'RECORD_NOT_FOUND',
        requestId: reqId,
      });
      return;
    }

    if (prismaCode === 'P2003') {
      // Foreign key constraint failure
      reqLogger.warn({ reqId, prismaCode, meta: err.meta }, 'Foreign key relation failed');
      res.status(400).json({
        error: 'Referenced related record does not exist or relation constraint failed',
        code: 'FOREIGN_KEY_VIOLATION',
        requestId: reqId,
      });
      return;
    }

    if (prismaCode === 'P2024') {
      // Connection pool timeout
      reqLogger.error({ reqId, prismaCode, err }, 'Database connection pool timed out');
      res.status(503).json({
        error: 'Database connection timed out. Please retry in a few moments.',
        code: 'DATABASE_TIMEOUT',
        requestId: reqId,
      });
      return;
    }
  }

  if (err.name === 'PrismaClientValidationError') {
    reqLogger.warn({ reqId, errMessage: err.message }, 'Database query validation error');
    res.status(400).json({
      error: 'Invalid query parameters provided to database engine',
      code: 'DATABASE_VALIDATION_ERROR',
      requestId: reqId,
    });
    return;
  }

  if (err.name === 'PrismaClientInitializationError') {
    reqLogger.fatal({ reqId, err }, 'Database service is currently unreachable');
    res.status(503).json({
      error: 'Database service is currently unreachable. Please try again shortly.',
      code: 'DATABASE_UNAVAILABLE',
      requestId: reqId,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Zod Schema Validation Errors
  // ─────────────────────────────────────────────────────────────────────────────
  if (err instanceof ZodError || err.name === 'ZodError') {
    const issues = (err.issues || []).map((issue: any) => ({
      field: issue.path?.join('.') || 'root',
      message: issue.message,
      code: issue.code,
    }));

    const primaryMessage = issues[0]?.message || 'Validation failed';
    reqLogger.warn({ reqId, validationErrors: issues }, primaryMessage);

    res.status(400).json({
      error: primaryMessage,
      validationErrors: issues,
      code: 'VALIDATION_ERROR',
      requestId: reqId,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Rate Limit Errors (429)
  // ─────────────────────────────────────────────────────────────────────────────
  if (err instanceof RateLimitError || err.statusCode === 429 || err.name === 'RateLimitError') {
    if (err.retryAfter) {
      res.setHeader('Retry-After', String(err.retryAfter));
    }
    const message = err.message || 'Rate limit exceeded. Please slow down and try again.';
    reqLogger.warn({ reqId, retryAfter: err.retryAfter }, message);

    res.status(429).json({
      error: message,
      code: 'RATE_LIMITED',
      retryAfter: err.retryAfter,
      requestId: reqId,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Upstream Payment Failures (Stripe & Razorpay)
  // ─────────────────────────────────────────────────────────────────────────────
  // Stripe error detection
  if (err.type?.startsWith('Stripe') || err.rawType) {
    const stripeType = err.type || err.rawType;
    reqLogger.error({ reqId, stripeType, message: err.message, code: err.code }, 'Stripe gateway error');

    if (stripeType === 'StripeCardError') {
      res.status(402).json({
        error: err.message || 'Payment card transaction was declined',
        code: 'PAYMENT_CARD_DECLINED',
        declineCode: err.decline_code,
        requestId: reqId,
      });
      return;
    }

    if (stripeType === 'StripeRateLimitError') {
      res.status(502).json({
        error: 'Payment processor is temporarily busy. Please retry shortly.',
        code: 'PAYMENT_GATEWAY_RATE_LIMIT',
        requestId: reqId,
      });
      return;
    }

    if (stripeType === 'StripeConnectionError') {
      res.status(502).json({
        error: 'Unable to connect to payment processor. Please check your network and retry.',
        code: 'PAYMENT_GATEWAY_UNAVAILABLE',
        requestId: reqId,
      });
      return;
    }

    // Default safe gateway error
    res.status(502).json({
      error: 'Payment gateway encountered an unexpected processing error',
      code: 'PAYMENT_GATEWAY_ERROR',
      requestId: reqId,
    });
    return;
  }

  // Razorpay error detection
  if (err.error && typeof err.error === 'object' && err.error.description) {
    reqLogger.error({ reqId, razorpayError: err.error }, 'Razorpay gateway error');
    res.status(502).json({
      error: err.error.description || 'Razorpay payment processing failed',
      code: 'PAYMENT_GATEWAY_ERROR',
      requestId: reqId,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Upstream Email Delivery Failures
  // ─────────────────────────────────────────────────────────────────────────────
  const emailErrorCodes = ['EAUTH', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EENVELOPE'];
  if (emailErrorCodes.includes(err.code) || err.name === 'ResendError' || err instanceof UpstreamServiceError) {
    reqLogger.error({ reqId, errCode: err.code, errName: err.name, message: err.message }, 'Upstream email delivery failed');
    res.status(502).json({
      error: 'Failed to communicate with transactional email service. Please try again.',
      code: 'UPSTREAM_EMAIL_FAILURE',
      requestId: reqId,
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Generic AppError or Standard HTTP Exceptions
  // ─────────────────────────────────────────────────────────────────────────────
  const statusCode = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode <= 599
    ? err.statusCode
    : 500;

  // Mask message if 500 in production to avoid leaking sensitive internal details
  const message = (statusCode === 500 && config.isProduction)
    ? 'An internal server error occurred. Please contact support with the Request ID.'
    : (err.message || 'Internal server error');

  if (statusCode >= 500) {
    reqLogger.error({ reqId, err, statusCode }, `Server Error [HTTP ${statusCode}]: ${err.message}`);
  } else {
    reqLogger.warn({ reqId, errMessage: err.message, statusCode }, `Client Warning [HTTP ${statusCode}]: ${err.message}`);
  }

  const responsePayload: Record<string, any> = {
    error: message,
    code: err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
    requestId: reqId,
  };

  if (err.details) {
    responsePayload.details = err.details;
  }

  // Stack traces strictly gated by configuration — NEVER returned based solely on loose NODE_ENV
  if (config.security.exposeStackTraces && err.stack) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
}
