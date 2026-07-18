/**
 * tasks/task-retry.ts — 重试策略
 *
 * - fixed / linear / exponential
 * - 最大重试次数
 * - 条件重试（按错误类型/谓词）
 * - 抖动
 */
import type { Task } from './types.js';

export type RetryStrategy = 'fixed' | 'linear' | 'exponential';

export interface RetryPolicy {
  strategy: RetryStrategy;
  /** 基础延迟 ms */
  baseDelayMs: number;
  /** 最大延迟 ms（指数退避上限） */
  maxDelayMs: number;
  /** 最大重试次数（不含首次） */
  maxRetries: number;
  /** 抖动比例 0-1，0 = 无抖动 */
  jitter: number;
  /** 条件谓词：返回 true 才重试 */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  strategy: 'exponential',
  baseDelayMs: 100,
  maxDelayMs: 5000,
  maxRetries: 3,
  jitter: 0.2,
};

/** 计算第 attempt 次重试（1 起）前的等待毫秒。 */
export function computeDelay(policy: RetryPolicy, attempt: number): number {
  let delay: number;
  switch (policy.strategy) {
    case 'fixed':
      delay = policy.baseDelayMs;
      break;
    case 'linear':
      delay = policy.baseDelayMs * attempt;
      break;
    case 'exponential':
    default:
      delay = policy.baseDelayMs * Math.pow(2, attempt - 1);
      break;
  }
  if (delay > policy.maxDelayMs) delay = policy.maxDelayMs;
  if (policy.jitter > 0) {
    const j = policy.jitter * delay;
    delay = delay - j + Math.random() * 2 * j;
  }
  return Math.max(0, Math.round(delay));
}

/** 判断是否应继续重试：次数未超且谓词通过。 */
export function shouldRetry(
  policy: RetryPolicy,
  error: Error,
  attempt: number,
): boolean {
  if (attempt > policy.maxRetries) return false;
  if (policy.shouldRetry && !policy.shouldRetry(error, attempt)) return false;
  return true;
}

/** 根据任务的 retryCount/maxRetries 判断是否还能重试。 */
export function canRetryTask(task: Task): boolean {
  return task.retryCount < task.maxRetries;
}

/** 创建固定延迟策略。 */
export function fixedRetry(maxRetries: number, baseDelayMs = 100): RetryPolicy {
  return { ...DEFAULT_RETRY_POLICY, strategy: 'fixed', maxRetries, baseDelayMs };
}

/** 创建指数退避策略。 */
export function exponentialRetry(
  maxRetries: number,
  baseDelayMs = 100,
  maxDelayMs = 5000,
): RetryPolicy {
  return { ...DEFAULT_RETRY_POLICY, strategy: 'exponential', maxRetries, baseDelayMs, maxDelayMs };
}

/** 仅对特定错误名称重试。 */
export function retryOnErrors(
  names: string[],
  base: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryPolicy {
  return {
    ...base,
    shouldRetry: (err) => names.length === 0 || names.includes(err.name),
  };
}

/** 永不重试策略。 */
export function noRetry(): RetryPolicy {
  return { ...DEFAULT_RETRY_POLICY, maxRetries: 0 };
}
