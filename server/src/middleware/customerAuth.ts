import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { createError } from './errorHandler';
import { prisma } from '../lib/prisma';

export interface CustomerTokenPayload {
  email: string;
  tenantId: string;
  role: 'CUSTOMER' | 'ADMIN' | 'STAFF' | 'SUPER_ADMIN' | 'USER';
  bookingId?: string;
  type?: string;
}

declare global {
  namespace Express {
    interface Request {
      customer?: CustomerTokenPayload;
    }
  }
}

/**
 * Generate a 24-hour customer portal session token
 */
export function generateCustomerToken(payload: { email: string; tenantId: string }): string {
  return jwt.sign(
    {
      email: payload.email.trim().toLowerCase(),
      tenantId: payload.tenantId,
      role: 'CUSTOMER',
      type: 'CUSTOMER_PORTAL_SESSION',
    },
    config.jwt.secret,
    { expiresIn: '24h' }
  );
}

/**
 * Generate an expiring 30-day magic booking access token
 */
export function generateBookingAccessToken(payload: {
  bookingId: string;
  email: string;
  tenantId: string;
}): string {
  return jwt.sign(
    {
      bookingId: payload.bookingId,
      email: payload.email.trim().toLowerCase(),
      tenantId: payload.tenantId,
      role: 'CUSTOMER',
      type: 'BOOKING_MAGIC_ACCESS',
    },
    config.jwt.secret,
    { expiresIn: '30d' }
  );
}

/**
 * Express middleware to authenticate customer requests via Bearer token or query param.
 * Seamlessly handles:
 * 1. Dedicated customer portal tokens (issued via OTP / Google / Magic link)
 * 2. Authenticated business users / owners browsing their public booking page
 */
export async function requireCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (typeof req.query.token === 'string') {
      token = req.query.token;
    } else if (typeof req.query.bookingToken === 'string') {
      token = req.query.bookingToken;
    }

    if (!token) {
      throw createError(
        401,
        'Authentication required. Please enter your verification code or use your access link to view bookings.'
      );
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;

    // Case 1: Standard Customer Token with email
    if (decoded.email) {
      req.customer = {
        email: decoded.email.trim().toLowerCase(),
        tenantId: decoded.tenantId,
        role: decoded.role || 'CUSTOMER',
        bookingId: decoded.bookingId,
        type: decoded.type,
      };
      return next();
    }

    // Case 2: Platform user/admin token attached by global Axios interceptor
    if (decoded.userId) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, tenantId: true },
      });

      if (user && user.email) {
        req.customer = {
          email: user.email.trim().toLowerCase(),
          tenantId: user.tenantId || decoded.tenantId,
          role: user.role as any,
        };
        return next();
      }
    }

    throw createError(401, 'Invalid authentication token. Please verify your email.');
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      next(createError(401, 'Your access link or session has expired. Please request a new code.'));
    } else if (err.name === 'JsonWebTokenError') {
      next(createError(401, 'Invalid security token. Please enter your verification code.'));
    } else {
      next(err);
    }
  }
}
