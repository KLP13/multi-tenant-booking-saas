import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
let isRedisConnected = false;

let redisClient: Redis | null = null;

try {
  if (redisUrl) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
    });
  } else {
    redisClient = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    redisClient.connect().catch(() => {
      console.warn('⚠️ Local Redis not running.');
    });
  }

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('✅ Connected to Upstash Redis successfully!');
  });

  redisClient.on('error', (err) => {
    if (isRedisConnected) {
      console.error('❌ Redis error:', err.message);
    }
  });
} catch (err) {
  console.error('❌ Redis init error:', err);
}

export const redis = redisClient;

// ─── Lock helpers ───────────────────────────────────────────────────────────

const LOCK_TTL_SECONDS = 600; // 10 minutes

// In-memory fallback for local development: Map<slotKey, Map<lockValue, expiresAt>>
const memoryMultiLocks = new Map<string, Map<string, number>>();

function cleanExpiredMemoryLocks(slotKey: string) {
  const now = Date.now();
  const locks = memoryMultiLocks.get(slotKey);
  if (!locks) return;
  for (const [val, exp] of locks.entries()) {
    if (exp <= now) {
      locks.delete(val);
    }
  }
  if (locks.size === 0) {
    memoryMultiLocks.delete(slotKey);
  }
}

/**
 * Build a consistent Redis key for a time slot multi-lock hash.
 * key = slot_locks:{resourceId}:{YYYY-MM-DD}:{HH:mm}
 */
export function buildLockKey(resourceId: string, date: string, startTime: string): string {
  return `slot_locks:${resourceId}:${date}:${startTime}`;
}

/**
 * Returns number of currently active locks for a slot
 */
export async function getLockedCount(
  resourceId: string,
  date: string,
  startTime: string
): Promise<number> {
  const key = buildLockKey(resourceId, date, startTime);
  const now = Date.now();

  if (redis && isRedisConnected) {
    try {
      const all = await redis.hgetall(key);
      let count = 0;
      for (const [val, expStr] of Object.entries(all)) {
        if (Number(expStr) > now) {
          count++;
        } else {
          // Cleanup expired field in background
          redis.hdel(key, val).catch(() => {});
        }
      }
      return count;
    } catch {
      // Fallback to memory
    }
  }

  cleanExpiredMemoryLocks(key);
  const locks = memoryMultiLocks.get(key);
  return locks ? locks.size : 0;
}

/**
 * Attempt to acquire a lock for a slot, respecting max available capacity.
 * availableCapacity = total resource capacity - active database bookings
 */
export async function acquireLock(
  resourceId: string,
  date: string,
  startTime: string,
  lockValue: string,
  availableCapacity = 1
): Promise<boolean> {
  const key = buildLockKey(resourceId, date, startTime);
  const now = Date.now();
  const expiresAt = now + LOCK_TTL_SECONDS * 1000;

  if (availableCapacity <= 0) {
    return false;
  }

  if (redis && isRedisConnected) {
    try {
      const all = await redis.hgetall(key);
      let activeCount = 0;
      let alreadyHeld = false;

      for (const [val, expStr] of Object.entries(all)) {
        if (Number(expStr) > now) {
          if (val === lockValue) {
            alreadyHeld = true;
          }
          activeCount++;
        } else {
          redis.hdel(key, val).catch(() => {});
        }
      }

      // If this client already holds a lock for this slot, refresh expiry
      if (alreadyHeld) {
        await redis.hset(key, lockValue, expiresAt.toString());
        await redis.expire(key, LOCK_TTL_SECONDS);
        return true;
      }

      if (activeCount >= availableCapacity) {
        return false; // All units currently locked or booked
      }

      await redis.hset(key, lockValue, expiresAt.toString());
      await redis.expire(key, LOCK_TTL_SECONDS);
      return true;
    } catch {
      // Fallback to memory
    }
  }

  // Memory fallback
  cleanExpiredMemoryLocks(key);
  let locks = memoryMultiLocks.get(key);
  if (!locks) {
    locks = new Map<string, number>();
    memoryMultiLocks.set(key, locks);
  }

  if (locks.has(lockValue)) {
    locks.set(lockValue, expiresAt);
    return true;
  }

  if (locks.size >= availableCapacity) {
    return false;
  }

  locks.set(lockValue, expiresAt);
  return true;
}

/**
 * Release a specific lock hold
 */
export async function releaseLock(
  resourceId: string,
  date: string,
  startTime: string,
  lockValue: string
): Promise<boolean> {
  const key = buildLockKey(resourceId, date, startTime);

  if (redis && isRedisConnected) {
    try {
      const deleted = await redis.hdel(key, lockValue);
      return deleted > 0;
    } catch {
      // Fallback to memory
    }
  }

  cleanExpiredMemoryLocks(key);
  const locks = memoryMultiLocks.get(key);
  if (locks && locks.has(lockValue)) {
    locks.delete(lockValue);
    if (locks.size === 0) memoryMultiLocks.delete(key);
    return true;
  }
  return false;
}

/**
 * Check if a slot is currently fully locked for exclusive resources
 */
export async function isLocked(
  resourceId: string,
  date: string,
  startTime: string
): Promise<boolean> {
  const count = await getLockedCount(resourceId, date, startTime);
  return count > 0;
}


// ─── OTP helpers ────────────────────────────────────────────────────────────

const memoryOtps = new Map<string, { otp: string; expiresAt: number }>();

export async function storeOtp(email: string, otp: string, ttlSeconds = 600): Promise<void> {
  const key = `otp:${email.toLowerCase().trim()}`;
  if (redis && isRedisConnected) {
    try {
      await redis.set(key, otp, 'EX', ttlSeconds);
      return;
    } catch {
      // Fallback to memory
    }
  }
  memoryOtps.set(key, { otp, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function verifyOtp(email: string, candidateOtp: string): Promise<boolean> {
  const key = `otp:${email.toLowerCase().trim()}`;
  if (redis && isRedisConnected) {
    try {
      const stored = await redis.get(key);
      if (stored && stored === candidateOtp.trim()) {
        await redis.del(key);
        return true;
      }
      return false;
    } catch {
      // Fallback to memory
    }
  }

  const stored = memoryOtps.get(key);
  if (stored && stored.expiresAt > Date.now() && stored.otp === candidateOtp.trim()) {
    memoryOtps.delete(key);
    return true;
  }
  return false;
}

