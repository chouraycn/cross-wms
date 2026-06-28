/**
 * Generic retry framework with exponential backoff and jitter.
 * Inspired by openclaw's retry.ts implementation.
 */

export interface RetryConfig {
  /** Maximum number of attempts (default: 3) */
  attempts?: number;
  /** Minimum delay in milliseconds (default: 300ms) */
  minDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000ms) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 (default: 0) */
  jitter?: number;
  /** Function to determine if an error is retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
  /** Abort signal to cancel retry */
  signal?: AbortSignal;
}

const DEFAULT_RETRY_CONFIG = {
  attempts: 3,
  minDelayMs: 300,
  maxDelayMs: 30000,
  jitter: 0,
  shouldRetry: () => true,
};

/**
 * Calculate delay with exponential backoff and optional jitter.
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const minDelayMs = config.minDelayMs ?? 300;
  const maxDelayMs = config.maxDelayMs ?? 30000;
  const jitter = config.jitter ?? 0;
  const baseDelay = minDelayMs * Math.pow(2, attempt - 1);
  const clampedDelay = Math.min(baseDelay, maxDelayMs);

  if (jitter && jitter > 0) {
    const jitterRange = clampedDelay * jitter;
    const randomJitter = Math.random() * 2 * jitterRange - jitterRange;
    return Math.round(Math.max(0, clampedDelay + randomJitter));
  }

  return clampedDelay;
}

/**
 * Check if we should retry based on Retry-After header or error type.
 */
export function getRetryAfterMs(error: unknown): number | null {
  if (error instanceof Error) {
    // Check for Retry-After header in error message (common pattern)
    const match = error.message.match(/retry-after[:\s]*(\d+)/i);
    if (match) {
      return parseInt(match[1], 10) * 1000; // Convert seconds to ms
    }
  }
  return null;
}

/**
 * Check if error is retryable based on common patterns.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('enetunreach') ||
      message.includes('ehostunreach') ||
      message.includes('connect') ||
      message.includes('timeout') ||
      message.includes('reset') ||
      message.includes('closed') ||
      message.includes('unavailable') ||
      message.includes('socket')
    ) {
      return true;
    }

    // HTTP status codes that are retryable
    if ('status' in error && typeof (error as any).status === 'number') {
      const status = (error as any).status;
      if (status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timeout = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
    });
  });
}

/**
 * Retry a function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.attempts!; attempt++) {
    // Check abort signal
    if (cfg.signal?.aborted) {
      throw new Error('Aborted');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= cfg.attempts! || !cfg.shouldRetry!(error, attempt)) {
        throw error;
      }

      // Calculate delay
      let delay = calculateBackoff(attempt, cfg);

      // Check for Retry-After
      const retryAfterMs = getRetryAfterMs(error);
      if (retryAfterMs !== null) {
        delay = Math.max(delay, retryAfterMs);
      }

      cfg.onRetry?.(error, attempt, delay);

      // Wait before retry
      try {
        await sleep(delay, cfg.signal);
      } catch (sleepError) {
        throw new Error('Aborted');
      }
    }
  }

  throw lastError;
}

/**
 * Retry with async iterator support for streaming responses.
 */
export async function retryStreaming<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;
  const controller = new AbortController();

  // Link external signal
  cfg.signal?.addEventListener('abort', () => controller.abort());

  for (let attempt = 1; attempt <= cfg.attempts!; attempt++) {
    if (cfg.signal?.aborted || controller.signal.aborted) {
      throw new Error('Aborted');
    }

    try {
      // Create fresh abort signal for each attempt
      const attemptController = new AbortController();
      const linkSignal = () => {
        cfg.signal?.addEventListener('abort', () => attemptController.abort());
        controller.signal.addEventListener('abort', () => attemptController.abort());
      };
      linkSignal();

      return await fn(attemptController.signal);
    } catch (error) {
      lastError = error;

      if (attempt >= cfg.attempts! || !cfg.shouldRetry!(error, attempt)) {
        throw error;
      }

      let delay = calculateBackoff(attempt, cfg);
      const retryAfterMs = getRetryAfterMs(error);
      if (retryAfterMs !== null) {
        delay = Math.max(delay, retryAfterMs);
      }

      cfg.onRetry?.(error, attempt, delay);

      try {
        await sleep(delay, cfg.signal);
      } catch {
        throw new Error('Aborted');
      }
    }
  }

  throw lastError;
}

/**
 * Create a retry config for channel API calls.
 */
export function createChannelRetryConfig(): RetryConfig {
  return {
    attempts: 3,
    minDelayMs: 400,
    maxDelayMs: 30000,
    jitter: 0.1,
    shouldRetry: (error) => {
      // Match patterns: 429, 421, timeout, connect, reset, closed, unavailable, etc.
      const retryablePatterns =
        /429|421|timeout|connect|reset|closed|unavailable|temporarily|misdirected/i;
      if (error instanceof Error && retryablePatterns.test(error.message)) {
        return true;
      }
      if (typeof error === 'object' && error !== null) {
        const status = (error as any).status || (error as any).statusCode;
        if (typeof status === 'number' && (status === 429 || status === 502 || status === 503)) {
          return true;
        }
      }
      return isRetryableError(error);
    },
  };
}
