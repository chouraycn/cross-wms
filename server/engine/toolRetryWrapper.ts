/**
 * Tool Retry Wrapper — 工具级重试机制
 *
 * 对工具调用的 transient error 自动重试：
 * 1. 网络错误（ECONNRESET, ETIMEDOUT, ENOTFOUND）
 * 2. HTTP 5xx 错误
 * 3. HTTP 429 速率限制错误（带 Retry-After 支持）
 * 4. MCP Server 临时不可用
 * 5. 文件锁冲突
 *
 * v11.1: 新增工具级重试机制
 */

import { logger } from '../logger.js';
import { retry, type RetryConfig } from '../infra/retry.js';
// P1-3: 引入统一错误类型，使 isTransientError 能识别 ToolTimeoutError
import { ToolTimeoutError } from '../errors/toolErrors.js';

export interface ToolRetryOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  jitter?: number;
  /** P2-3: 重试事件回调 — 由 toolExecutor 传入，用于触发 SSE tool_retry 事件 */
  onRetryEvent?: (info: { attempt: number; maxAttempts: number; reason: string; error: unknown }) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  attempts: 3,
  minDelayMs: 1000,
  maxDelayMs: 5000,
  jitter: 0.2,
};

const DEFAULT_MAX_ATTEMPTS = 3;

export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // P1-3: 统一错误类型 ToolTimeoutError 视为瞬时错误（可重试）
  // 超时通常是临时性故障（网络抖动、服务繁忙），重试有概率成功
  if (error instanceof ToolTimeoutError) {
    return true;
  }

  // P0 修复：AbortError 是用户主动取消，绝不重试
  // 区分"用户取消"（不重试）与"超时触发的 abort"（可重试）
  if (error.name === 'AbortError') {
    // 用户主动取消：message 通常为 "请求已取消" / "User cancelled" / "Aborted"
    const msg = error.message.toLowerCase();
    if (msg.includes('用户') || msg.includes('user') || msg.includes('cancelled') || msg === 'aborted') {
      return false;
    }
    // 超时触发的 abort：message 通常含 "timeout" — 可重试
    if (msg.includes('timeout')) {
      return true;
    }
    // 其他 AbortError：保守不重试
    return false;
  }

  // 注意: message 已通过 toLowerCase() 转为小写，因此正则模式也必须为小写
  const transientPatterns = [
    /econnreset/,
    /etimedout/,
    /enotfound/,
    /econnrefused/,
    /epipe/,
    /esockettimedout/,
    /eai_again/,
    /ehostunreach/,
    /enetunreach/,
    /econnaborted/,
    /networkerror/,
    /fetch failed/,
    /socket hang up/,
    /timeouterror/,
  ];

  const message = error.message.toLowerCase();
  if (transientPatterns.some(pattern => pattern.test(message))) {
    return true;
  }

  const errorName = error.name.toLowerCase();
  if (['networkerror', 'timeouterror'].includes(errorName)) {
    return true;
  }

  if (message.includes('500') || 
      message.includes('502') || 
      message.includes('503') || 
      message.includes('504') ||
      message.includes('408') ||
      message.includes('522') ||
      message.includes('524')) {
    return true;
  }

  if (message.includes('429') || message.includes('rate limit')) {
    return true;
  }

  if (message.includes('file lock') || 
      message.includes('session locked') ||
      message.includes('lock held')) {
    return true;
  }

  return false;
}

export interface RetryResult<T> {
  result: T;
  retryCount: number;
}

export async function executeToolCallWithRetry<T>(
  toolName: string,
  executor: () => Promise<T>,
  options: ToolRetryOptions = {},
  signal?: AbortSignal,
): Promise<RetryResult<T>> {
  const config: RetryConfig = {
    attempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    minDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_CONFIG.minDelayMs,
    maxDelayMs: options.maxRetryDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitter: options.jitter ?? DEFAULT_RETRY_CONFIG.jitter,
    signal, // P1-5: 传入 signal，使重试 sleep 可取消 + 每次 attempt 前检查是否已 abort
    shouldRetry: (error) => isTransientError(error),
    onRetry: (error, attempt, delay) => {
      logger.warn(
        `[ToolRetry] Retrying tool '${toolName}' (attempt ${attempt}/${options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS}): ` +
        `${error instanceof Error ? error.message : String(error)} ` +
        `(next retry in ${delay}ms)`
      );
    },
  };

  let retryCount = 0;
  const wrappedConfig: RetryConfig = {
    ...config,
    onRetry: (error, attempt, delay) => {
      retryCount++;
      const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[ToolRetry] Retrying tool '${toolName}' (attempt ${attempt}/${maxAttempts}): ` +
        `${reason} ` +
        `(next retry in ${delay}ms)`
      );
      // P2-3: 触发外部回调（用于 SSE tool_retry 事件）
      options.onRetryEvent?.({
        attempt,
        maxAttempts,
        reason,
        error,
      });
    },
  };

  const result = await retry(executor, wrappedConfig);
  return { result, retryCount };
}