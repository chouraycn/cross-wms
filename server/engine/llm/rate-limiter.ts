/**
 * 速率限制 — TPM / RPM / 并发限制。
 *
 * 提供进程内令牌桶 + 滑动窗口实现，用于在客户端侧限制对 Provider 的调用频率。
 * 注意：此实现不替代 Provider 服务端的限制，仅作为客户端保护。
 */
import { logger } from '../../logger.js';

/** 速率限制配置。 */
export type RateLimitConfig = {
  /** 每分钟最大请求数（RPM）。 */
  requestsPerMinute?: number;
  /** 每分钟最大 token 数（TPM）。 */
  tokensPerMinute?: number;
  /** 最大并发数。 */
  maxConcurrent?: number;
};

/** 速率限制快照。 */
export type RateLimitSnapshot = {
  requestsInWindow: number;
  tokensInWindow: number;
  inFlight: number;
  rpmLimit?: number;
  tpmLimit?: number;
  concurrentLimit?: number;
};

/** 滑动窗口计数器（毫秒级）。 */
class SlidingWindow {
  private events: Array<{ time: number; tokens: number }> = [];
  constructor(private windowMs: number) {}

  /** 添加事件。 */
  add(time: number, tokens: number): void {
    this.events.push({ time, tokens });
    this.evict(time);
  }

  /** 移除窗口外事件。 */
  private evict(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.events.length > 0 && this.events[0].time < cutoff) {
      this.events.shift();
    }
  }

  /** 当前窗口内事件数。 */
  count(now: number): number {
    this.evict(now);
    return this.events.length;
  }

  /** 当前窗口内 token 总数。 */
  tokens(now: number): number {
    this.evict(now);
    return this.events.reduce((s, e) => s + e.tokens, 0);
  }
}

/** 速率限制器。 */
export class RateLimiter {
  private rpmWindow: SlidingWindow;
  private tpmWindow: SlidingWindow;
  private inFlight = 0;
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig = {}) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? Infinity,
      tokensPerMinute: config.tokensPerMinute ?? Infinity,
      maxConcurrent: config.maxConcurrent ?? Infinity,
    };
    this.rpmWindow = new SlidingWindow(60_000);
    this.tpmWindow = new SlidingWindow(60_000);
  }

  /** 检查是否允许发起请求（不消耗配额）。 */
  canRequest(now = Date.now()): boolean {
    if (this.inFlight >= this.config.maxConcurrent) return false;
    if (this.rpmWindow.count(now) >= this.config.requestsPerMinute) return false;
    return true;
  }

  /** 检查是否允许消耗指定 token 数（不消耗配额）。 */
  canConsumeTokens(tokens: number, now = Date.now()): boolean {
    if (this.tpmWindow.tokens(now) + tokens > this.config.tokensPerMinute) return false;
    return true;
  }

  /** 记录一次请求开始。 */
  acquire(now = Date.now()): boolean {
    if (!this.canRequest(now)) {
      logger.debug(`[LLM:RateLimit] Rejected: rpm/concurrent limit reached`);
      return false;
    }
    this.inFlight++;
    this.rpmWindow.add(now, 0);
    return true;
  }

  /** 记录一次请求完成（含 token 消耗）。 */
  release(tokens = 0, now = Date.now()): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (tokens > 0) {
      this.tpmWindow.add(now, tokens);
    }
  }

  /** 异步等待直到可以发起请求。 */
  async waitForAvailability(timeoutMs = 60_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.canRequest()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  /** 当前快照。 */
  snapshot(now = Date.now()): RateLimitSnapshot {
    return {
      requestsInWindow: this.rpmWindow.count(now),
      tokensInWindow: this.tpmWindow.tokens(now),
      inFlight: this.inFlight,
      rpmLimit: this.config.requestsPerMinute === Infinity ? undefined : this.config.requestsPerMinute,
      tpmLimit: this.config.tokensPerMinute === Infinity ? undefined : this.config.tokensPerMinute,
      concurrentLimit: this.config.maxConcurrent === Infinity ? undefined : this.config.maxConcurrent,
    };
  }

  /** 更新配置。 */
  updateConfig(config: RateLimitConfig): void {
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? Infinity,
      tokensPerMinute: config.tokensPerMinute ?? Infinity,
      maxConcurrent: config.maxConcurrent ?? Infinity,
    };
  }

  /** 重置状态。 */
  reset(): void {
    this.rpmWindow = new SlidingWindow(60_000);
    this.tpmWindow = new SlidingWindow(60_000);
    this.inFlight = 0;
  }
}

/** 多 Provider 共享的速率限制器注册表。 */
const limiters = new Map<string, RateLimiter>();

/** 为指定 Provider 获取或创建速率限制器。 */
export function getRateLimiter(provider: string, config?: RateLimitConfig): RateLimiter {
  let limiter = limiters.get(provider);
  if (!limiter) {
    limiter = new RateLimiter(config);
    limiters.set(provider, limiter);
  } else if (config) {
    limiter.updateConfig(config);
  }
  return limiter;
}

/** 移除指定 Provider 的速率限制器。 */
export function removeRateLimiter(provider: string): void {
  limiters.delete(provider);
}

/** 清空所有速率限制器（测试用）。 */
export function clearRateLimiters(): void {
  limiters.clear();
}

/** 默认 Provider 速率限制配置。 */
export const DEFAULT_PROVIDER_LIMITS: Record<string, RateLimitConfig> = {
  openai: { requestsPerMinute: 500, tokensPerMinute: 150_000, maxConcurrent: 10 },
  anthropic: { requestsPerMinute: 50, tokensPerMinute: 40_000, maxConcurrent: 5 },
  google: { requestsPerMinute: 60, tokensPerMinute: 250_000, maxConcurrent: 5 },
  azure: { requestsPerMinute: 480, tokensPerMinute: 120_000, maxConcurrent: 10 },
  bedrock: { requestsPerMinute: 100, tokensPerMinute: 100_000, maxConcurrent: 8 },
  deepseek: { requestsPerMinute: 60, tokensPerMinute: 50_000, maxConcurrent: 5 },
  moonshot: { requestsPerMinute: 60, tokensPerMinute: 60_000, maxConcurrent: 5 },
  qwen: { requestsPerMinute: 60, tokensPerMinute: 100_000, maxConcurrent: 5 },
  zhipu: { requestsPerMinute: 50, tokensPerMinute: 50_000, maxConcurrent: 5 },
  minimax: { requestsPerMinute: 30, tokensPerMinute: 30_000, maxConcurrent: 3 },
  baichuan: { requestsPerMinute: 30, tokensPerMinute: 30_000, maxConcurrent: 3 },
  ernie: { requestsPerMinute: 60, tokensPerMinute: 60_000, maxConcurrent: 5 },
  spark: { requestsPerMinute: 50, tokensPerMinute: 50_000, maxConcurrent: 5 },
  yi: { requestsPerMinute: 60, tokensPerMinute: 50_000, maxConcurrent: 5 },
  ollama: { requestsPerMinute: Infinity, tokensPerMinute: Infinity, maxConcurrent: 4 },
};
