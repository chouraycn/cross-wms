import { logger } from '../../logger.js';
import type { ReplyPayload } from './types.js';

export type FollowupTask = {
  id: string;
  sessionKey: string;
  prompt: string;
  delayMs: number;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
};

export type FollowupResult = {
  taskId: string;
  success: boolean;
  payload?: ReplyPayload;
  error?: string;
  retryCount: number;
};

export type FollowupRunnerOptions = {
  maxConcurrent?: number;
  defaultDelayMs?: number;
  onResult?: (result: FollowupResult) => void;
};

type RunningTask = {
  task: FollowupTask;
  retryCount: number;
  timer: ReturnType<typeof setTimeout>;
  resolved: boolean;
};

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_DELAY_MS = 1000;

export class FollowupRunner {
  private tasks: Map<string, RunningTask> = new Map();
  private options: FollowupRunnerOptions;
  private runningCount = 0;
  private pendingTasks: FollowupTask[] = [];

  constructor(options: FollowupRunnerOptions = {}) {
    this.options = {
      maxConcurrent: options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      defaultDelayMs: options.defaultDelayMs ?? DEFAULT_DELAY_MS,
      onResult: options.onResult,
    };
  }

  schedule(task: FollowupTask): string {
    const id = task.id || `followup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const taskWithId = { ...task, id };

    if (this.runningCount >= (this.options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)) {
      this.pendingTasks.push(taskWithId);
      logger.debug(`[AutoReply] Followup task ${id} queued (pending)`);
      return id;
    }

    this.startTask(taskWithId, 0);
    return id;
  }

  private startTask(task: FollowupTask, retryCount: number): void {
    const delay = task.delayMs ?? this.options.defaultDelayMs ?? DEFAULT_DELAY_MS;
    this.runningCount++;

    const timer = setTimeout(() => {
      void this.executeTask(task, retryCount);
    }, delay);

    this.tasks.set(task.id, {
      task,
      retryCount,
      timer,
      resolved: false,
    });

    logger.debug(`[AutoReply] Followup task ${task.id} scheduled in ${delay}ms`);
  }

  private async executeTask(task: FollowupTask, retryCount: number): Promise<void> {
    const running = this.tasks.get(task.id);
    if (!running) return;

    try {
      const payload = await this.runTask(task);
      running.resolved = true;

      const result: FollowupResult = {
        taskId: task.id,
        success: true,
        payload,
        retryCount,
      };

      this.options.onResult?.(result);
      this.completeTask(task.id);
    } catch (err) {
      const maxRetries = task.maxRetries ?? 2;
      if (retryCount < maxRetries) {
        logger.warn(
          `[AutoReply] Followup task ${task.id} failed, retrying (${retryCount + 1}/${maxRetries})`,
        );
        running.retryCount = retryCount + 1;
        running.timer = setTimeout(() => {
          void this.executeTask(task, retryCount + 1);
        }, Math.min(1000 * Math.pow(2, retryCount), 30000));
        return;
      }

      running.resolved = true;
      const result: FollowupResult = {
        taskId: task.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryCount,
      };

      this.options.onResult?.(result);
      this.completeTask(task.id);
    }
  }

  protected async runTask(_task: FollowupTask): Promise<ReplyPayload> {
    return { text: '' };
  }

  private completeTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.runningCount = Math.max(0, this.runningCount - 1);
    this.processPending();
  }

  private processPending(): void {
    while (
      this.pendingTasks.length > 0 &&
      this.runningCount < (this.options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)
    ) {
      const task = this.pendingTasks.shift();
      if (task) {
        this.startTask(task, 0);
      }
    }
  }

  cancel(taskId: string): boolean {
    const running = this.tasks.get(taskId);
    if (!running) return false;

    clearTimeout(running.timer);
    this.tasks.delete(taskId);
    this.runningCount = Math.max(0, this.runningCount - 1);
    logger.debug(`[AutoReply] Followup task ${taskId} cancelled`);
    this.processPending();
    return true;
  }

  cancelAll(sessionKey?: string): void {
    const toCancel: string[] = [];
    for (const [id, running] of this.tasks.entries()) {
      if (!sessionKey || running.task.sessionKey === sessionKey) {
        toCancel.push(id);
      }
    }
    for (const id of toCancel) {
      this.cancel(id);
    }
  }

  getActiveCount(sessionKey?: string): number {
    if (!sessionKey) return this.tasks.size;
    let count = 0;
    for (const running of this.tasks.values()) {
      if (running.task.sessionKey === sessionKey) count++;
    }
    return count;
  }

  getPendingCount(sessionKey?: string): number {
    if (!sessionKey) return this.pendingTasks.length;
    return this.pendingTasks.filter((t) => t.sessionKey === sessionKey).length;
  }

  dispose(): void {
    for (const [, running] of this.tasks.entries()) {
      clearTimeout(running.timer);
    }
    this.tasks.clear();
    this.pendingTasks = [];
    this.runningCount = 0;
  }
}

export function createFollowupRunner(
  options?: FollowupRunnerOptions & {
    runTask?: (task: FollowupTask) => Promise<ReplyPayload>;
  },
): FollowupRunner {
  const runner = new FollowupRunner(options);
  if (options?.runTask) {
    (runner as unknown as { runTask: (task: FollowupTask) => Promise<ReplyPayload> }).runTask =
      options.runTask;
  }
  return runner;
}
