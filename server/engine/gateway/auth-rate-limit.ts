import { logger } from '../../logger.js';

export type RateLimitEntry = {
  count: number;
  windowStart: number;
  lockedUntil?: number;
};

export type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  lockoutDurationMs?: number;
  scope?: string;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
  resetTime?: number;
} {
  const now = Date.now();
  const { maxAttempts, windowMs, lockoutDurationMs } = config;
  const storeKey = config.scope ? `${config.scope}:${key}` : key;

  let entry = rateLimitStore.get(storeKey);

  if (!entry || now - entry.windowStart > windowMs) {
    entry = {
      count: 0,
      windowStart: now,
    };
    rateLimitStore.set(storeKey, entry);
  }

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.lockedUntil - now,
      resetTime: entry.lockedUntil,
    };
  }

  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.count = 0;
    entry.windowStart = now;
    entry.lockedUntil = undefined;
  }

  const remaining = Math.max(0, maxAttempts - entry.count);
  const allowed = entry.count < maxAttempts;

  if (!allowed && lockoutDurationMs) {
    entry.lockedUntil = now + lockoutDurationMs;
    logger.warn(`[Gateway] Rate limit exceeded for key: ${storeKey}`);
  }

  return {
    allowed,
    remaining: Math.max(0, remaining - 1),
    resetTime: entry.windowStart + windowMs,
  };
}

export function incrementRateLimit(key: string, config: RateLimitConfig): void {
  const storeKey = config.scope ? `${config.scope}:${key}` : key;
  let entry = rateLimitStore.get(storeKey);

  if (!entry) {
    entry = {
      count: 1,
      windowStart: Date.now(),
    };
    rateLimitStore.set(storeKey, entry);
  } else {
    entry.count++;
  }
}

export function resetRateLimit(key: string, scope?: string): void {
  const storeKey = scope ? `${scope}:${key}` : key;
  rateLimitStore.delete(storeKey);
}

export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

export function getRateLimitStatus(key: string, config: RateLimitConfig): RateLimitEntry | undefined {
  const storeKey = config.scope ? `${config.scope}:${key}` : key;
  return rateLimitStore.get(storeKey);
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  const maxAge = 86400000;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > maxAge && (!entry.lockedUntil || now > entry.lockedUntil)) {
      rateLimitStore.delete(key);
    }
  }
}

let cleanupInterval: NodeJS.Timeout | null = null;

export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanupExpiredEntries, 3600000);
  cleanupInterval.unref?.();
}

export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
