/**
 * 超时控制器
 *
 * 管理总体超时与无输出超时，支持取消与重置。
 */

import type { TerminationReason } from './types.js';

/** 超时触发回调 */
export type TimeoutCallback = (reason: TerminationReason) => void;

export interface TimeoutControllerOptions {
  /** 总体超时（毫秒），> 0 启用 */
  overallTimeoutMs?: number;
  /** 无输出超时（毫秒），> 0 启用 */
  idleTimeoutMs?: number;
  /** 触发回调 */
  onTimeout: TimeoutCallback;
  /** 可选的 setTimeout 实现（用于测试） */
  scheduler?: typeof setTimeout;
  /** 可选的 clearTimeout 实现（用于测试） */
  clearer?: typeof clearTimeout;
  /** 性能时间源（用于测试） */
  now?: () => number;
}

/**
 * 超时控制器
 *
 * 同时管理 overall + idle 两个定时器：
 * - overall：从 arm 开始固定时长
 * - idle：每次 touchOutput 重置
 */
export class TimeoutController {
  private readonly options: Required<Omit<TimeoutControllerOptions, 'overallTimeoutMs' | 'idleTimeoutMs' | 'onTimeout'>> & {
    overallTimeoutMs: number | undefined;
    idleTimeoutMs: number | undefined;
    onTimeout: TimeoutCallback;
  };
  private overallTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private overallDeadlineMs: number | null = null;
  private idleDeadlineMs: number | null = null;
  private armed = false;
  private disposed = false;

  constructor(options: TimeoutControllerOptions) {
    const scheduler = options.scheduler ?? setTimeout;
    const clearer = options.clearer ?? clearTimeout;
    const now = options.now ?? (() => Date.now());
    this.options = {
      scheduler,
      clearer,
      now,
      overallTimeoutMs: options.overallTimeoutMs,
      idleTimeoutMs: options.idleTimeoutMs,
      onTimeout: options.onTimeout,
    };
  }

  /** 启动定时器（幂等，重复调用不会叠加） */
  arm(): void {
    if (this.disposed || this.armed) {
      return;
    }
    this.armed = true;
    const { overallTimeoutMs, idleTimeoutMs } = this.options;
    if (overallTimeoutMs && overallTimeoutMs > 0) {
      this.overallDeadlineMs = this.options.now() + overallTimeoutMs;
      this.overallTimer = this.options.scheduler(
        () => this.fire('overall-timeout'),
        overallTimeoutMs,
      );
    }
    if (idleTimeoutMs && idleTimeoutMs > 0) {
      this.idleDeadlineMs = this.options.now() + idleTimeoutMs;
      this.idleTimer = this.options.scheduler(
        () => this.fire('idle-timeout'),
        idleTimeoutMs,
      );
    }
  }

  /** 标记一次输出活动（重置 idle 定时器） */
  touchOutput(): void {
    if (this.disposed || !this.armed) {
      return;
    }
    const { idleTimeoutMs } = this.options;
    if (!idleTimeoutMs || idleTimeoutMs <= 0) {
      return;
    }
    if (this.idleTimer) {
      this.options.clearer(this.idleTimer);
    }
    this.idleDeadlineMs = this.options.now() + idleTimeoutMs;
    this.idleTimer = this.options.scheduler(
      () => this.fire('idle-timeout'),
      idleTimeoutMs,
    );
  }

  /** 清除所有定时器 */
  clear(): void {
    if (this.overallTimer) {
      this.options.clearer(this.overallTimer);
      this.overallTimer = null;
    }
    if (this.idleTimer) {
      this.options.clearer(this.idleTimer);
      this.idleTimer = null;
    }
    this.overallDeadlineMs = null;
    this.idleDeadlineMs = null;
    this.armed = false;
  }

  /** 永久释放（之后 arm 无效） */
  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  /** 检查截止时间是否已过（用于在自然退出后判定超时优先） */
  resolveElapsedReason(now?: number): TerminationReason | null {
    const nowMs = now ?? this.options.now();
    const elapsed: Array<{ reason: TerminationReason; deadline: number }> = [];
    if (this.overallDeadlineMs !== null && nowMs >= this.overallDeadlineMs) {
      elapsed.push({ reason: 'overall-timeout', deadline: this.overallDeadlineMs });
    }
    if (this.idleDeadlineMs !== null && nowMs >= this.idleDeadlineMs) {
      elapsed.push({ reason: 'idle-timeout', deadline: this.idleDeadlineMs });
    }
    if (elapsed.length === 0) {
      return null;
    }
    elapsed.sort((a, b) => a.deadline - b.deadline);
    return elapsed[0].reason;
  }

  private fire(reason: TerminationReason): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.options.onTimeout(reason);
  }
}

/** 用超时竞速一个 Promise */
export async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  scheduler: typeof setTimeout = setTimeout,
  clearer: typeof clearTimeout = clearTimeout,
): Promise<T> {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
    return await task;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = scheduler(() => reject(new ProcessTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timer) {
      clearer(timer);
    }
  }
}

/** 进程超时错误 */
export class ProcessTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Process timed out after ${timeoutMs}ms`);
    this.name = 'ProcessTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
