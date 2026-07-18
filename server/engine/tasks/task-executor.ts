/**
 * tasks/task-executor.ts — 任务执行器
 *
 * 单任务执行：处理重试 / 超时 / 取消 / 进度上报，返回 TaskResult。
 * - 协作式取消：handler 通过 ctx.signal/isCancelled 检查
 * - 强制取消：token 取消后立即 reject 执行（Promise.race）
 * - 超时：到期 reject TimeoutError
 */
import { logger } from '../../logger.js';
import { nowIso } from './types.js';
import type { Task, TaskResult, TaskExecutionContext, TaskHandler } from './types.js';
import {
  CancellationError,
  createToken,
  linkCancellation,
  type CancellationToken,
} from './task-cancellation.js';
import { ProgressTracker } from './task-progress.js';
import {
  DEFAULT_RETRY_POLICY,
  computeDelay,
  shouldRetry,
  type RetryPolicy,
} from './task-retry.js';

export class TimeoutError extends Error {
  constructor(msg = 'task timeout') {
    super(msg);
    this.name = 'TimeoutError';
  }
}

export interface ExecuteOptions {
  handler: TaskHandler;
  retryPolicy?: RetryPolicy;
  /** 覆盖任务超时；不传则用 task.timeoutMs */
  timeoutMs?: number;
  /** 外部取消令牌（如调度器管理） */
  token?: CancellationToken;
  /** 进度回调（可选） */
  onProgress?: (percent: number, phase?: string) => void;
}

export interface ExecuteResult {
  result: TaskResult;
  output: unknown;
}

/** 执行单个任务，处理重试/超时/取消。 */
export async function executeTask(task: Task, opts: ExecuteOptions): Promise<ExecuteResult> {
  const policy = opts.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const timeoutMs = opts.timeoutMs ?? task.timeoutMs ?? 0;
  const token = opts.token ?? createToken();
  const tracker = new ProgressTracker();
  tracker.attach(task);
  if (opts.onProgress) {
    tracker.report({ percent: 0, phase: 'started' });
  }

  const startedAt = task.startedAt ?? nowIso();
  let attempt = 0;
  let lastError: Error | null = null;

  // 取消监听：取消时立即 reject 当前执行
  while (attempt <= policy.maxRetries) {
    attempt += 1;
    if (token.cancelled) {
      lastError = new CancellationError(token.reason);
      break;
    }

    const ctx: TaskExecutionContext = {
      taskId: task.id,
      signal: token.signal,
      cancel: (reason?: string) => token.cancel(reason),
      reportProgress: (p) => {
        tracker.report(p);
        if (opts.onProgress && p.percent !== undefined) opts.onProgress(p.percent, p.phase);
      },
      isCancelled: () => token.cancelled,
      attempt,
    };

    try {
      const output = await raceWithTimeoutAndCancellation(
        opts.handler(task, ctx),
        timeoutMs,
        token,
      );
      // 成功
      const completedAt = nowIso();
      const result: TaskResult = {
        status: 'completed',
        output,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
        attempts: attempt,
        startedAt,
        completedAt,
      };
      task.retryCount = attempt - 1;
      task.result = result;
      return { result, output };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;
      if (error instanceof CancellationError) {
        break; // 取消不重试
      }
      task.retryCount = attempt - 1;
      if (!shouldRetry(policy, error, attempt)) {
        break;
      }
      logger.debug(`[TaskExecutor] retry task=${task.id} attempt=${attempt} err=${error.message}`);
      await sleep(computeDelay(policy, attempt), token);
      if (token.cancelled) {
        lastError = new CancellationError(token.reason);
        break;
      }
    }
  }

  // 失败/取消/超时收尾
  const completedAt = nowIso();
  let status: TaskResult['status'] = 'failed';
  if (lastError instanceof CancellationError) status = 'cancelled';
  else if (lastError instanceof TimeoutError) status = 'timeout';
  const result: TaskResult = {
    status,
    ...(lastError ? { error: lastError.message } : {}),
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    attempts: attempt,
    startedAt,
    completedAt,
  };
  task.result = result;
  task.error = lastError?.message ?? null;
  return { result, output: undefined };
}

/** 同时与超时、取消竞争。 */
function raceWithTimeoutAndCancellation<T>(
  promise: Promise<T>,
  timeoutMs: number,
  token: CancellationToken,
): Promise<T> {
  const racers: Promise<T>[] = [promise];

  if (timeoutMs > 0) {
    racers.push(
      new Promise<T>((_, reject) => {
        const t = setTimeout(() => reject(new TimeoutError()), timeoutMs);
        token.onCancel(() => {
          clearTimeout(t);
        });
      }),
    );
  }

  racers.push(
    new Promise<T>((_, reject) => {
      if (token.cancelled) {
        reject(new CancellationError(token.reason));
        return;
      }
      token.onCancel(() => reject(new CancellationError(token.reason)));
    }),
  );

  return Promise.race(racers);
}

/** 可被取消的 sleep。 */
function sleep(ms: number, token: CancellationToken): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>(resolve => {
    const t = setTimeout(resolve, ms);
    token.onCancel(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** 高层封装：直接以 handler 执行 task（无重试/超时）。便于一次性调用。 */
export async function runOnce(task: Task, handler: TaskHandler): Promise<ExecuteResult> {
  return executeTask(task, {
    handler,
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
    timeoutMs: 0,
  });
}

export { linkCancellation };
