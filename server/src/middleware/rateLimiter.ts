import { Request, Response, NextFunction } from 'express';
import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';

interface CustomLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
}

/**
 * Creates an express-rate-limit instance with standardized error payload and correlation ID tracking.
 */
function createCustomLimiter(options: CustomLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true, // Return standard RateLimit-* headers
    legacyHeaders: false,   // Disable X-RateLimit-* headers
    skip: () => process.env.NODE_ENV === 'test' || process.env.SKIP_RATE_LIMIT === 'true',
    handler: (req: Request, res: Response, _next: NextFunction, limitOptions: Options) => {
      const resetTime = (req as any).rateLimit?.resetTime
        ? Math.max(1, Math.ceil(((req as any).rateLimit.resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);

      res.setHeader('Retry-After', resetTime);

      if (req.log) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.originalUrl || req.url,
            retryAfter: resetTime,
          },
          `Rate limit exceeded: ${options.message}`
        );
      }

      res.status(429).json({
        error: options.message,
        code: 'RATE_LIMITED',
        retryAfter: resetTime,
        requestId: req.id,
      });
    },
  });
}

/**
 * Rate limiter for credential-based authentication (/auth/login, /auth/google)
 * Allows up to 10 attempts per 15-minute window per IP.
 */
export const loginRateLimiter = createCustomLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
});

/**
 * Rate limiter for generating & sending email verification OTPs (/auth/send-registration-otp)
 * Allows up to 5 OTP requests per 10-minute window per IP.
 */
export const otpRateLimiter = createCustomLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Too many OTP requests. Please wait 10 minutes before requesting a new code.',
});

/**
 * Rate limiter for tenant workspace creation (/auth/register-tenant)
 * Allows up to 5 registrations per 1-hour window per IP.
 */
export const registerRateLimiter = createCustomLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many business registrations created from this IP. Please try again in an hour.',
});

/**
 * Rate limiter for password reset flows (/auth/forgot-password, /auth/reset-password)
 * Allows up to 5 attempts per 15-minute window per IP.
 */
export const passwordResetRateLimiter = createCustomLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait 15 minutes before trying again.',
});

/**
 * General application-wide rate limiter protecting standard API endpoints from scraping/flooding.
 * Allows up to 300 requests per 15-minute window per IP.
 */
export const generalApiLimiter = createCustomLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please slow down.',
});
