/**
 * tasks/task-timeout.ts — 超时处理
 *
 * - 单任务超时
 * - 阶段超时
 * - 全局超时（截止时间）
 * - 基于 setTimeout，提供 clear/extend
 */
import { logger } from '../../logger.js';
import type { Task } from './types.js';

export type TimeoutReason = 'task' | 'phase' | 'global';

export interface TimeoutHandle {
  readonly taskId: string;
  readonly reason: TimeoutReason;
  clear: () => void;
  /** 重置到新的 deadline（ms 后触发）。 */
  extend: (ms: number) => void;
  /** 是否已触发。 */
  fired: () => boolean;
}

export interface TimeoutManagerOptions {
  /** 是否在触发时调用 onTimeout；默认 true */
  autoInvoke?: boolean;
}

export class TaskTimeoutManager {
  private handles = new Map<string, Set<TimeoutHandle>>();
  private onTimeout?: (taskId: string, reason: TimeoutReason) => void;

  constructor(
    onTimeout?: (taskId: string, reason: TimeoutReason) => void,
    _opts: TimeoutManagerOptions = {},
  ) {
    this.onTimeout = onTimeout;
  }

  /** 为任务注册一个超时。返回 handle。 */
  register(taskId: string, ms: number, reason: TimeoutReason = 'task'): TimeoutHandle {
    const handle = this.createHandle(taskId, ms, reason);
    if (!this.handles.has(taskId)) this.handles.set(taskId, new Set());
    this.handles.get(taskId)!.add(handle);
    return handle;
  }

  /** 从 task.timeoutMs 注册。timeoutMs <= 0 时不注册，返回 null。 */
  registerForTask(task: Task, reason: TimeoutReason = 'task'): TimeoutHandle | null {
    if (!task.timeoutMs || task.timeoutMs <= 0) return null;
    return this.register(task.id, task.timeoutMs, reason);
  }

  /** 清除任务的所有超时。 */
  clearAll(taskId: string): void {
    const set = this.handles.get(taskId);
    if (!set) return;
    for (const h of set) h.clear();
    this.handles.delete(taskId);
  }

  /** 该任务是否有活跃超时。 */
  has(taskId: string): boolean {
    const set = this.handles.get(taskId);
    return !!set && set.size > 0;
  }

  /** 全局截止时间：返回在 beforeMs 内必须完成的任务列表（仅用于规划）。 */
  dueSoon(tasks: Task[], beforeMs: number, now: number = Date.now()): Task[] {
    return tasks.filter(t => {
      if (!t.startedAt || t.timeoutMs <= 0) return false;
      const deadline = Date.parse(t.startedAt) + t.timeoutMs;
      return deadline - now <= beforeMs && deadline - now > 0;
    });
  }

  private createHandle(taskId: string, ms: number, reason: TimeoutReason): TimeoutHandle {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let didFire = false;
    const fire = () => {
      if (didFire) return;
      didFire = true;
      logger.debug(`[TaskTimeout] fire task=${taskId} reason=${reason}`);
      this.onTimeout?.(taskId, reason);
      this.handles.get(taskId)?.delete(handle);
    };
    const start = () => {
      timer = setTimeout(fire, ms);
    };
    const handle: TimeoutHandle = {
      taskId,
      reason,
      clear: () => {
        if (timer) clearTimeout(timer);
        timer = null;
        this.handles.get(taskId)?.delete(handle);
      },
      extend: (newMs: number) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fire, newMs);
      },
      fired: () => didFire,
    };
    start();
    return handle;
  }
}
