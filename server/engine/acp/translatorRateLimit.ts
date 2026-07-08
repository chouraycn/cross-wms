/**
 * ACP Translator - Rate Limiting
 * 限流控制（openclaw 兼容）
 *
 * 参考 openclaw/src/acp/translator.rate-limit.ts 设计
 *
 * 功能：基于令牌桶和滑动窗口的限流控制
 */

import type { AcpTurnRequest } from "./acpTypes.js";

/** 限流配置 */
export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 令牌桶容量（默认等于 maxRequests） */
  bucketCapacity?: number;
  /** 令牌补充速率（每秒） */
  refillRate?: number;
  /** 是否按 session 维度限流 */
  perSession?: boolean;
}

/** 限流结果 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
  reason?: string;
}

/** 令牌桶状态 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestCount: number;
  windowStart: number;
}

/** 默认限流配置 */
const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  windowMs: 60000,
  maxRequests: 60,
  bucketCapacity: 60,
  refillRate: 1,
  perSession: true,
};

/**
 * 限流器
 * 支持令牌桶 + 滑动窗口混合算法
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private buckets = new Map<string, TokenBucket>();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 获取或创建桶 */
  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.bucketCapacity,
        lastRefill: Date.now(),
        requestCount: 0,
        windowStart: Date.now(),
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /** 补充令牌 */
  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / 1000) * this.config.refillRate;
    bucket.tokens = Math.min(this.config.bucketCapacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /** 重置窗口 */
  private resetWindowIfNeeded(bucket: TokenBucket): void {
    const now = Date.now();
    if (now - bucket.windowStart >= this.config.windowMs) {
      bucket.requestCount = 0;
      bucket.windowStart = now;
    }
  }

  /** 检查限流 */
  check(key: string = "global"): RateLimitResult {
    const bucket = this.getBucket(key);
    this.refillTokens(bucket);
    this.resetWindowIfNeeded(bucket);

    const now = Date.now();
    const windowEnd = bucket.windowStart + this.config.windowMs;

    // 检查令牌桶
    if (bucket.tokens < 1) {
      const tokensNeeded = 1 - bucket.tokens;
      const retryAfterMs = (tokensNeeded / this.config.refillRate) * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfterMs: Math.ceil(retryAfterMs),
        reason: "Token bucket exhausted",
      };
    }

    // 检查窗口限制
    if (bucket.requestCount >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfterMs: windowEnd - now,
        reason: "Window limit exceeded",
      };
    }

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens) - 1,
      resetAt: windowEnd,
    };
  }

  /** 消费一个令牌（通过后调用） */
  consume(key: string = "global"): void {
    const bucket = this.getBucket(key);
    this.refillTokens(bucket);
    this.resetWindowIfNeeded(bucket);
    bucket.tokens = Math.max(0, bucket.tokens - 1);
    bucket.requestCount++;
  }

  /** 检查并消费 */
  checkAndConsume(key: string = "global"): RateLimitResult {
    const result = this.check(key);
    if (result.allowed) {
      this.consume(key);
    }
    return result;
  }

  /** 重置指定 key */
  reset(key: string = "global"): void {
    this.buckets.delete(key);
  }

  /** 重置所有 */
  resetAll(): void {
    this.buckets.clear();
  }

  /** 获取统计 */
  getStats(key: string = "global"): {
    tokens: number;
    requestCount: number;
    windowStart: number;
  } | null {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;
    this.refillTokens(bucket);
    return {
      tokens: bucket.tokens,
      requestCount: bucket.requestCount,
      windowStart: bucket.windowStart,
    };
  }
}

/** 全局限流器实例 */
let rateLimiterInstance: RateLimiter | null = null;

/** 获取全局限流器 */
export function getRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config);
  }
  return rateLimiterInstance;
}

/** 重置全局限流器（用于测试） */
export function resetRateLimiter(): void {
  rateLimiterInstance = null;
}

/** 限流装饰器函数 - 用于包装 translator 请求 */
export function withRateLimit<T extends (...args: any[]) => any>(
  fn: T,
  options: {
    limiter?: RateLimiter;
    keyFn?: (...args: Parameters<T>) => string;
  } = {},
): (...args: Parameters<T>) => ReturnType<T> | { error: string; rateLimit: RateLimitResult } {
  const limiter = options.limiter ?? getRateLimiter();
  const keyFn = options.keyFn ?? (() => "global");

  return ((...args: Parameters<T>) => {
    const key = keyFn(...args);
    const result = limiter.checkAndConsume(key);
    if (!result.allowed) {
      return {
        error: `Rate limit exceeded: ${result.reason}`,
        rateLimit: result,
      };
    }
    return fn(...args);
  }) as (...args: Parameters<T>) => ReturnType<T> | { error: string; rateLimit: RateLimitResult };
}

/** 从 turn request 提取限流 key */
export function getRateLimitKeyFromRequest(request: AcpTurnRequest): string {
  return `session:${request.sessionId}`;
}
