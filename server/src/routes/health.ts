import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const router = Router();

/**
 * GET /health/live (Liveness probe)
 * Verifies that the Node.js event loop and process are running and capable of handling traffic.
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready (Readiness probe)
 * Tests core system dependencies (PostgreSQL via Prisma & Redis cache) independently with latency tracking.
 * Returns 200 if critical dependencies (database) are healthy, or 503 if unavailable.
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const startDb = Date.now();
  let dbHealthy = false;
  let dbLatencyMs = 0;
  let dbError: string | undefined;

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    dbHealthy = true;
    dbLatencyMs = Date.now() - startDb;
  } catch (err: any) {
    dbLatencyMs = Date.now() - startDb;
    dbError = err.message || 'Database connection error';
  }

  const startRedis = Date.now();
  let redisHealthy = false;
  let redisLatencyMs = 0;
  let redisMode = 'in-memory';

  try {
    if (redis && typeof redis.ping === 'function') {
      const pong = await redis.ping();
      redisHealthy = pong === 'PONG';
      redisMode = 'distributed-redis';
    } else {
      // In-memory fallback mode
      redisHealthy = true;
      redisMode = 'in-memory-fallback';
    }
    redisLatencyMs = Date.now() - startRedis;
  } catch {
    redisLatencyMs = Date.now() - startRedis;
    redisHealthy = false;
  }

  const isReady = dbHealthy;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? (redisHealthy ? 'ok' : 'degraded') : 'unavailable',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        latencyMs: dbLatencyMs,
        ...(dbError && { error: dbError }),
      },
      cache: {
        status: redisHealthy ? 'healthy' : 'unhealthy',
        mode: redisMode,
        latencyMs: redisLatencyMs,
      },
    },
  });
});

// Backward compatibility for standard /health
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
