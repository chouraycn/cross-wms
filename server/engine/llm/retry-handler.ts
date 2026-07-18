/**
 * 重试处理 — 429 / 5xx / 超时重试。
 *
 * 提供指数退避 + 抖动策略，遵循 Retry-After 头与错误分类。
 */
import { logger } from '../../logger.js';
import { classifyError, LLMErrorCode } from './error-mapper.js';

/** 重试配置。 */
export type RetryConfig = {
  /** 最大重试次数（不含首次）。 */
  maxRetries: number;
  /** 初始退避毫秒。 */
  initialDelayMs: number;
  /** 退避乘数。 */
  backoffMultiplier: number;
  /** 最大退避毫秒。 */
  maxDelayMs: number;
  /** 抖动比例（0~1）。 */
  jitterRatio: number;
  /** 总超时毫秒。 */
  timeoutMs?: number;
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
};

/** 重试决策结果。 */
export type RetryDecision =
  | { shouldRetry: true; delayMs: number; attempt: number }
  | { shouldRetry: false; reason: string };

/** 计算下一次重试的延迟（含退避 + 抖动）。 */
export function computeBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const base = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(base, config.maxDelayMs);
  if (config.jitterRatio <= 0) return capped;
  const jitter = capped * config.jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(capped + jitter));
}

/** 根据错误与重试状态决定是否重试。 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  config: RetryConfig,
  retryAfterMs?: number,
): RetryDecision {
  if (attempt >= config.maxRetries) {
    return { shouldRetry: false, reason: 'max-retries-exceeded' };
  }
  const classified = classifyError(error);
  if (!classified.retryable) {
    return { shouldRetry: false, reason: `non-retryable: ${classified.code}` };
  }
  const delay = retryAfterMs ?? computeBackoffDelay(attempt, config);
  return { shouldRetry: true, delayMs: delay, attempt: attempt + 1 };
}

/** 异步等待。 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/** 执行带重试的异步函数。 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  config: Partial<RetryConfig> = {},
  options: {
    signal?: AbortSignal;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  } = {},
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();
  let attempt = 0;
  let lastError: unknown;
  while (true) {
    if (options.signal?.aborted) {
      throw new Error('aborted');
    }
    if (fullConfig.timeoutMs && Date.now() - startTime > fullConfig.timeoutMs) {
      throw new Error('retry-timeout-exceeded');
    }
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const retryAfterMs = extractRetryAfter(error);
      const decision = shouldRetry(error, attempt, fullConfig, retryAfterMs);
      if (!decision.shouldRetry) {
        throw error;
      }
      logger.debug(`[LLM:Retry] Attempt ${attempt + 1} failed, retrying in ${decision.delayMs}ms`);
      options.onRetry?.(decision.attempt, decision.delayMs, error);
      await sleep(decision.delayMs, options.signal);
      attempt = decision.attempt;
    }
  }
}

/** 从错误对象中提取 Retry-After 值（毫秒）。 */
export function extractRetryAfter(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { retryAfter?: number; retryAfterMs?: number; headers?: { get?: (k: string) => string | null } };
  if (typeof e.retryAfterMs === 'number') return e.retryAfterMs;
  if (typeof e.retryAfter === 'number') return e.retryAfter * 1000;
  const headers = e.headers;
  if (headers && typeof headers.get === 'function') {
    const raw = headers.get('retry-after');
    if (raw) {
      const asNum = parseInt(raw, 10);
      if (!isNaN(asNum)) return asNum * 1000;
      const asDate = Date.parse(raw);
      if (!isNaN(asDate)) return Math.max(0, asDate - Date.now());
    }
  }
  return undefined;
}

/** 创建一个总是失败的函数（用于测试重试）。 */
export function makeAlwaysFailFn(errorFactory: (attempt: number) => unknown): (attempt: number) => Promise<never> {
  return async (attempt: number) => {
    throw errorFactory(attempt);
  };
}

/** 创建一个在第 N 次后成功的函数（用于测试重试）。 */
export function makeSucceedAfterNFn<T>(
  n: number,
  successValue: T,
  failError?: unknown,
): (attempt: number) => Promise<T> {
  return async (attempt: number) => {
    if (attempt >= n) return successValue;
    throw failError ?? new Error('transient-failure');
  };
}
