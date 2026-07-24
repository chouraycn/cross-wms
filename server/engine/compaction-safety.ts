/**
 * Compaction Safety - 安全超时与重试机制
 *
 * 为压缩操作提供安全超时保护和智能重试机制
 */
import { logger } from '../logger.js';

/** 默认压缩超时：3 分钟 */
export const DEFAULT_COMPACTION_TIMEOUT_MS = 180_000;

/** 默认重试配置 */
export const DEFAULT_RETRY_CONFIG = {
  attempts: 3,
  minDelayMs: 500,
  maxDelayMs: 5000,
  jitter: 0.2,
};

/** 重试配置接口 */
export interface RetryConfig {
  attempts: number;
  minDelayMs: number;
  maxDelayMs: number;
  jitter: number;
}

/** 超时选项 */
export interface SafetyTimeoutOptions {
  abortSignal?: AbortSignal;
  onCancel?: () => void;
  onTimeout?: () => void;
}

/**
 * 判断是否为 AbortError
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (err instanceof Error) {
    return err.name === 'AbortError' || err.message === 'aborted';
  }
  return false;
}

/**
 * 判断是否为超时错误
 */
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.name === 'TimeoutError' ||
      err.message.includes('timeout') ||
      err.message.includes('timed out')
    );
  }
  return false;
}

/**
 * 创建 AbortError
 */
export function createAbortError(reason?: unknown): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  if (reason instanceof Error) {
    (err as Error & { cause?: unknown }).cause = reason;
  } else if (reason !== undefined) {
    err.message = `aborted: ${reason}`;
  }
  return err;
}

/**
 * 组合多个 AbortSignal
 */
export function composeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): { signal?: AbortSignal; cleanup: () => void } {
  const activeSignals = signals.filter((s): s is AbortSignal => Boolean(s));

  if (activeSignals.length === 0) {
    return { signal: undefined, cleanup: () => {} };
  }

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0], cleanup: () => {} };
  }

  const controller = new AbortController();
  const removers: Array<() => void> = [];

  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    const onAbort = () => abortFrom(signal);
    signal.addEventListener('abort', onAbort, { once: true });
    removers.push(() => signal.removeEventListener('abort', onAbort));
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const remove of removers) {
        remove();
      }
    },
  };
}

/**
 * 带安全超时的压缩执行
 *
 * @param compact 压缩执行函数
 * @param timeoutMs 超时毫秒数
 * @param options 选项
 */
export async function compactWithSafetyTimeout<T>(
  compact: (abortSignal?: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_COMPACTION_TIMEOUT_MS,
  options?: SafetyTimeoutOptions,
): Promise<T> {
  let canceled = false;
  const cancel = () => {
    if (canceled) return;
    canceled = true;
    try {
      options?.onCancel?.();
    } catch {
      // best-effort
    }
  };

  const timeoutController = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      cancel();
      options?.onTimeout?.();
      timeoutController.abort(new Error(`Compaction timed out after ${timeoutMs}ms`));
      reject(new Error(`Compaction timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // 允许取消定时器
    const cleanupTimer = () => {
      clearTimeout(timer);
    };

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', cleanupTimer, { once: true });
    }

    timeoutController.signal.addEventListener('abort', cleanupTimer, { once: true });
  });

  const abortPromise = options?.abortSignal
    ? new Promise<never>((_, reject) => {
        if (options.abortSignal!.aborted) {
          reject(createAbortError(options.abortSignal!.reason));
          return;
        }
        const handler = () => {
          cancel();
          reject(createAbortError(options.abortSignal!.reason));
        };
        options.abortSignal!.addEventListener('abort', handler, { once: true });
      })
    : Promise.race([]); // 空 Promise，永远不会 resolve

  const composedAbort = composeAbortSignals(options?.abortSignal, timeoutController.signal);

  try {
    const compactPromise = compact(composedAbort.signal);
    return await Promise.race([compactPromise, timeoutPromise, abortPromise]);
  } finally {
    composedAbort.cleanup();
  }
}

/**
 * 指数退避延迟计算
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const exponentialDelay = config.minDelayMs * Math.pow(2, attempt);
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = clampedDelay * config.jitter * (Math.random() * 2 - 1);
  return Math.round(clampedDelay + jitter);
}

/**
 * 带重试的异步执行
 *
 * @param fn 要执行的函数
 * @param config 重试配置
 * @param label 标签（用于日志）
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  label: string = 'operation',
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < fullConfig.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // AbortError 和 TimeoutError 立即传播
      if (isAbortError(err) || isTimeoutError(err)) {
        logger.debug(`[${label}] Abort/Timeout error，传播错误:`, err instanceof Error ? err.message : String(err));
        throw err;
      }

      // 最后一次尝试失败
      if (attempt === fullConfig.attempts - 1) {
        logger.warn(`[${label}] 重试 ${attempt + 1}/${fullConfig.attempts} 失败:`, err instanceof Error ? err.message : String(err));
        break;
      }

      const delay = calculateBackoffDelay(attempt, fullConfig);
      logger.debug(`[${label}] 重试 ${attempt + 1}/${fullConfig.attempts} 失败，${delay}ms 后重试:`, err instanceof Error ? err.message : String(err));

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 部分结果错误类型
 */
export class PartialSummaryError extends Error {
  readonly partialSummary?: string;

  constructor(message: string, partialSummary?: string) {
    super(message);
    this.name = 'PartialSummaryError';
    this.partialSummary = partialSummary;
  }
}

/**
 * 带部分结果重试的压缩摘要
 *
 * 当部分 chunk 摘要成功后，即使后续失败也能返回已生成的部分摘要
 */
export async function retryWithPartialSummary(
  chunks: unknown[],
  summarizeFn: (chunk: unknown) => Promise<string>,
  config: Partial<RetryConfig> = {},
): Promise<{ summary: string; completedChunks: number; totalChunks: number }> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let summary = '';
  let completedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let chunkSuccess = false;

    for (let attempt = 0; attempt < fullConfig.attempts; attempt++) {
      try {
        const chunkSummary = await retryAsync(
          () => summarizeFn(chunk),
          fullConfig,
          `chunk-${i}`,
        );
        summary = summary ? `${summary}\n\n${chunkSummary}` : chunkSummary;
        completedChunks++;
        chunkSuccess = true;
        break;
      } catch (err) {
        if (isAbortError(err) || isTimeoutError(err)) {
          throw err;
        }

        if (attempt === fullConfig.attempts - 1) {
          logger.warn(`[partial-summary] chunk ${i} 摘要失败:`, err instanceof Error ? err.message : String(err));
        }
      }
    }

    // 至少一个 chunk 成功后可以继续
    if (!chunkSuccess && completedChunks > 0) {
      // 部分成功但后续失败，抛出部分摘要错误
      throw new PartialSummaryError(
        `Partial summary available after ${completedChunks}/${chunks.length} chunks`,
        summary,
      );
    }
  }

  return { summary, completedChunks, totalChunks: chunks.length };
}

/**
 * 安全执行压缩（带超时和重试）
 */
export async function safeCompact<T>(
  compactFn: (abortSignal?: AbortSignal) => Promise<T>,
  options: {
    timeoutMs?: number;
    retry?: Partial<RetryConfig>;
    abortSignal?: AbortSignal;
  } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_COMPACTION_TIMEOUT_MS, retry = {}, abortSignal } = options;

  const fullRetryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retry };

  return await compactWithSafetyTimeout(
    async (safetyAbortSignal) => {
      const composedAbort = composeAbortSignals(safetyAbortSignal, abortSignal);

      return await retryAsync(
        () => compactFn(composedAbort.signal),
        fullRetryConfig,
        'compaction',
      );
    },
    timeoutMs,
    { abortSignal },
  );
}
