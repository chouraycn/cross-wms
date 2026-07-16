import { logger } from '../../logger.js';
import { sleepWithAbort } from './backoff.js';

export type RetryConfig = {
  attempts?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
};

export type RetryInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  err: unknown;
  label?: string;
};

export type RetryOptions = RetryConfig & {
  label?: string;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  retryAfterMs?: (err: unknown) => number | undefined;
  onRetry?: (info: RetryInfo) => void;
};

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  attempts: 3,
  minDelayMs: 300,
  maxDelayMs: 30_000,
  jitter: 0,
};

export function resolveRetryConfig(
  defaults: RetryConfig,
  overrides?: RetryConfig,
): Required<RetryConfig> {
  const merged = { ...defaults, ...overrides };
  return {
    attempts: Math.max(1, Math.floor(merged.attempts ?? DEFAULT_RETRY_CONFIG.attempts)),
    minDelayMs: Math.max(0, Math.floor(merged.minDelayMs ?? DEFAULT_RETRY_CONFIG.minDelayMs)),
    maxDelayMs: Math.max(1, Math.floor(merged.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs)),
    jitter: Math.max(0, Math.min(1, merged.jitter ?? DEFAULT_RETRY_CONFIG.jitter)),
  };
}

function calculateRetryDelay(
  base: number,
  attempt: number,
  minMs: number,
  maxMs: number,
  jitter: number,
): number {
  const exponential = base * 2 ** Math.max(attempt - 1, 0);
  const j = exponential * jitter * Math.random();
  return Math.min(maxMs, Math.max(minMs, Math.round(exponential + j)));
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  attemptsOrOptions: number | RetryOptions = 3,
  initialDelayMs = 300,
): Promise<T> {
  const opts = typeof attemptsOrOptions === 'number'
    ? { attempts: attemptsOrOptions, minDelayMs: initialDelayMs, maxDelayMs: 30_000, jitter: 0 }
    : attemptsOrOptions;
  const config = resolveRetryConfig(DEFAULT_RETRY_CONFIG, opts);
  const maxAttempts = config.attempts;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) break;

      const retryAfterMs = opts.retryAfterMs?.(err);
      const delayMs = retryAfterMs !== undefined
        ? Math.min(config.maxDelayMs, Math.max(config.minDelayMs, retryAfterMs))
        : calculateRetryDelay(initialDelayMs, attempt, config.minDelayMs, config.maxDelayMs, config.jitter);

      if (opts.onRetry) {
        opts.onRetry({ attempt, maxAttempts, delayMs, err, label: opts.label });
      } else {
        logger.warn(`[Retry] ${opts.label ?? 'operation'} attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`);
      }
      await sleepWithAbort(delayMs);
    }
  }
  throw lastErr;
}
