import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { config } from './config/env';
import { logger } from './lib/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// Route imports
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import bookingRoutes from './routes/bookings';
import adminRoutes from './routes/admin';
import superadminRoutes from './routes/superadmin';
import webhookRoutes from './routes/webhook';
import healthRoutes from './routes/health';

// Middleware imports
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = config.port;

// ─── 1. Security Headers & Proxy Configuration ──────────────────────────────

// Reverse proxy trust: enables accurate req.ip & secure proto behind reverse proxies
app.set('trust proxy', config.isProduction ? 1 : false);

// Explicitly disable X-Powered-By header to obscure technology stack
app.disable('x-powered-by');

// Helmet security headers (CSP, HSTS, X-Content-Type-Options, etc.)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ─── 2. Request Correlation & Context ──────────────────────────────────────

// Request correlation ID & request latency logging (must precede route handlers)
app.use(requestIdMiddleware);

// ─── 3. Stricter CORS Configuration ────────────────────────────────────────

const allowedOrigins = [
  config.clientUrl,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In development mode, allow localhost on any port
      if (config.isDevelopment && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-ID', 'Retry-After', 'Idempotency-Key'],
    credentials: true,
    maxAge: 86400, // 24-hour preflight cache
  })
);

// ─── 4. Body-Size Limits ───────────────────────────────────────────────────

// Raw body required for Stripe webhook signature verification (capped at 2mb)
app.use('/api/webhook', express.raw({ type: 'application/json', limit: '2mb' }), webhookRoutes);

// JSON body parser with strict 100kb limit to prevent payload bomb DoS attacks
app.use(express.json({ limit: '100kb' }));

// URL-encoded form parser with strict 100kb limit
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ─── 5. Health & Readiness Probes ──────────────────────────────────────────

app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// ─── 6. Domain Application Routes ──────────────────────────────────────────

// Authentication & Staff Onboarding
app.use('/api/auth', authRoutes);

// Public tenant & slot browsing
app.use('/api', publicRoutes);

// Slot locking and booking flow
app.use('/api', bookingRoutes);

// Admin dashboard (scoped by tenant)
app.use('/api/admin', adminRoutes);

// Superadmin platform management
app.use('/api/superadmin', superadminRoutes);

// ─── 7. Centralized Error Handler (must be last) ───────────────────────────

app.use(errorHandler);

// ─── 8. Server Startup & Graceful Shutdown ────────────────────────────────

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.nodeEnv }, `🚀 Server running on http://localhost:${PORT}`);
});

let isShuttingDown = false;

function handleGracefulShutdown(signal: string): void {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, `[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('[Shutdown] HTTP listener closed. Draining database and cache connections...');

    try {
      await prisma.$disconnect();
      logger.info('[Shutdown] Database connection disconnected.');
    } catch (err) {
      logger.error({ err }, '[Shutdown] Error disconnecting Prisma database');
    }

    try {
      if (redis && typeof redis.quit === 'function') {
        await redis.quit();
        logger.info('[Shutdown] Redis connection closed.');
      }
    } catch (err) {
      logger.error({ err }, '[Shutdown] Error disconnecting Redis');
    }

    logger.info('[Shutdown] Graceful shutdown completed cleanly.');
    process.exit(0);
  });

  // Force process exit if connections do not drain within safety timeout
  setTimeout(() => {
    logger.error('[Shutdown] Forceful shutdown initiated after 10s timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

export default app;
