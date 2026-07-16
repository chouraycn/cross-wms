import { logger } from '../../logger.js';

export interface ChannelRateLimit {
  channelId: string;
  userId?: string;
  windowMs: number;
  maxRequests: number;
  currentCount: number;
  windowStart: number;
}

const rateLimits = new Map<string, ChannelRateLimit>();

function buildKey(channelId: string, userId?: string): string {
  return userId ? `${channelId}:${userId}` : channelId;
}

export function configureRateLimit(channelId: string, windowMs: number, maxRequests: number, userId?: string): void {
  const key = buildKey(channelId, userId);
  rateLimits.set(key, {
    channelId,
    userId,
    windowMs,
    maxRequests,
    currentCount: 0,
    windowStart: Date.now(),
  });
  logger.debug(`[Channels:RateLimit] Configured ${key}: ${maxRequests} req / ${windowMs}ms`);
}

export function checkRateLimit(channelId: string, userId?: string): { allowed: boolean; remaining: number; resetIn: number } {
  const key = buildKey(channelId, userId);
  const limit = rateLimits.get(key);
  if (!limit) {
    return { allowed: true, remaining: -1, resetIn: 0 };
  }
  const now = Date.now();
  if (now - limit.windowStart >= limit.windowMs) {
    limit.windowStart = now;
    limit.currentCount = 0;
  }
  limit.currentCount++;
  rateLimits.set(key, limit);
  const allowed = limit.currentCount <= limit.maxRequests;
  const remaining = Math.max(0, limit.maxRequests - limit.currentCount);
  const resetIn = Math.max(0, limit.windowStart + limit.windowMs - now);
  return { allowed, remaining, resetIn };
}

export function resetRateLimit(channelId: string, userId?: string): void {
  rateLimits.delete(buildKey(channelId, userId));
}

export function listRateLimits(): ChannelRateLimit[] {
  return Array.from(rateLimits.values());
}
