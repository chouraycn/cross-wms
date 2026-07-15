/**
 * 认证速率限制 — 参考 OpenClaw gateway/auth-rate-limit.ts
 *
 * 网关认证尝试的内存滑动窗口速率限制器。
 *
 * 按 {scope, clientIp} 跟踪失败的认证尝试。作用域让调用者为不同的凭证类
 * 保持独立的计数器，同时共享一个限制器实例。
 */

export interface RateLimitConfig {
  maxAttempts?: number;
  windowMs?: number;
  lockoutMs?: number;
  exemptLoopback?: boolean;
  pruneIntervalMs?: number;
}

export const AUTH_RATE_LIMIT_SCOPE_DEFAULT = 'default';
export const AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET = 'shared-secret';
export const AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN = 'device-token';
export const AUTH_RATE_LIMIT_SCOPE_NODE_PAIRING = 'node-pairing';
export const AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL = 'node-reapproval';
export const AUTH_RATE_LIMIT_SCOPE_BOOTSTRAP_TOKEN = 'bootstrap-token';
export const AUTH_RATE_LIMIT_SCOPE_HOOK_AUTH = 'hook-auth';

interface RateLimitEntry {
  attempts: number[];
  lockedUntil?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface AuthRateLimiter {
  check(ip: string | undefined, scope?: string): RateLimitCheckResult;
  recordFailure(ip: string | undefined, scope?: string): void;
  recordSuccess(ip: string | undefined, scope?: string): void;
  dispose(): void;
}

function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('localhost');
}

function normalizeClientIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  return ip.trim();
}

function buildRateLimitIdentityKey(ip: string | undefined, scope: string | undefined): string {
  return `${scope || AUTH_RATE_LIMIT_SCOPE_DEFAULT}:${normalizeClientIp(ip)}`;
}

export function createAuthRateLimiter(config: RateLimitConfig = {}): AuthRateLimiter {
  const {
    maxAttempts = 10,
    windowMs = 60_000,
    lockoutMs = 300_000,
    exemptLoopback = true,
    pruneIntervalMs = 60_000,
  } = config;

  const entries = new Map<string, RateLimitEntry>();
  let pruneTimer: ReturnType<typeof setInterval> | undefined;

  if (pruneIntervalMs > 0) {
    pruneTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of entries) {
        entry.attempts = entry.attempts.filter((t) => now - t <= windowMs);
        if (entry.attempts.length === 0 && !entry.lockedUntil) {
          entries.delete(key);
        }
      }
    }, pruneIntervalMs);

    const unref = (pruneTimer as { unref?: () => void }).unref;
    if (typeof unref === 'function') {
      unref.call(pruneTimer);
    }
  }

  function check(ip: string | undefined, scope?: string): RateLimitCheckResult {
    if (exemptLoopback && isLoopbackAddress(ip)) {
      return { allowed: true, remaining: maxAttempts, retryAfterMs: 0 };
    }

    const key = buildRateLimitIdentityKey(ip, scope);
    const entry = entries.get(key);

    if (!entry) {
      return { allowed: true, remaining: maxAttempts, retryAfterMs: 0 };
    }

    const now = Date.now();

    if (entry.lockedUntil && now < entry.lockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: entry.lockedUntil - now,
      };
    }

    entry.attempts = entry.attempts.filter((t) => now - t <= windowMs);
    const remaining = maxAttempts - entry.attempts.length;

    if (remaining <= 0) {
      entry.lockedUntil = now + lockoutMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: lockoutMs,
      };
    }

    return {
      allowed: true,
      remaining,
      retryAfterMs: 0,
    };
  }

  function recordFailure(ip: string | undefined, scope?: string): void {
    if (exemptLoopback && isLoopbackAddress(ip)) {
      return;
    }

    const key = buildRateLimitIdentityKey(ip, scope);
    let entry = entries.get(key);

    if (!entry) {
      entry = { attempts: [] };
      entries.set(key, entry);
    }

    entry.attempts.push(Date.now());
  }

  function recordSuccess(ip: string | undefined, scope?: string): void {
    if (exemptLoopback && isLoopbackAddress(ip)) {
      return;
    }

    const key = buildRateLimitIdentityKey(ip, scope);
    const entry = entries.get(key);

    if (entry) {
      entry.attempts = [];
      delete entry.lockedUntil;
    }
  }

  function dispose(): void {
    if (pruneTimer) {
      clearInterval(pruneTimer);
      pruneTimer = undefined;
    }
    entries.clear();
  }

  return {
    check,
    recordFailure,
    recordSuccess,
    dispose,
  };
}

export { buildRateLimitIdentityKey };