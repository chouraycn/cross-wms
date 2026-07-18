import { logger } from '../../logger.js';

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = condition();
      const resolved = result instanceof Promise ? await result : result;
      
      if (resolved) {
        return true;
      }
    } catch {
      // 忽略错误，继续等待
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  const actualPromise = typeof promise === 'function' ? promise() : promise;
  
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([actualPromise, timeoutPromise]);
  } finally {
    if (timeoutId!) {
      clearTimeout(timeoutId!);
    }
  }
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delayMs?: number;
    backoff?: 'linear' | 'exponential';
    shouldRetry?: (error: Error) => boolean;
  } = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const backoff = options.backoff ?? 'exponential';
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (attempt < retries && shouldRetry(lastError)) {
        const delay = backoff === 'exponential' 
          ? delayMs * Math.pow(2, attempt)
          : delayMs * (attempt + 1);
        
        logger.debug(`[Agents:RunWait] Retry ${attempt + 1}/${retries} in ${delay}ms`);
        await sleep(delay);
      } else {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

export interface PollResult<T> {
  value: T | undefined;
  completed: boolean;
  attempts: number;
  durationMs: number;
}

export async function poll<T>(
  fn: () => T | undefined | Promise<T | undefined>,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    maxAttempts?: number;
  } = {},
): Promise<PollResult<T>> {
  const intervalMs = options.intervalMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 60000;
  const maxAttempts = options.maxAttempts ?? Infinity;
  const startTime = Date.now();
  let attempts = 0;

  while (
    Date.now() - startTime < timeoutMs &&
    attempts < maxAttempts
  ) {
    attempts++;
    
    try {
      const result = fn();
      const value = result instanceof Promise ? await result : result;
      
      if (value !== undefined) {
        return {
          value,
          completed: true,
          attempts,
          durationMs: Date.now() - startTime,
        };
      }
    } catch {
      // 忽略错误，继续轮询
    }

    await sleep(intervalMs);
  }

  return {
    value: undefined,
    completed: false,
    attempts,
    durationMs: Date.now() - startTime,
  };
}

logger.debug('[Agents:RunWait] Module loaded');
