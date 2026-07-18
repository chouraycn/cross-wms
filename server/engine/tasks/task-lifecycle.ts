/**
 * tasks/task-lifecycle.ts — 生命周期管理
 *
 * 状态机：pending -> queued -> running -> (paused -> running) -> completed/failed/cancelled/timeout
 *
 * 提供 canTransition / applyTransition 与便捷操作（create/start/pause/resume/complete/fail/cancel/timeout）。
 * 依赖 TaskStore.update 持久化状态变更，并通过可选事件总线发事件。
 */
import { isPausableStatus, isTerminalStatus, nowIso } from './types.js';
import type { Task, TaskStatus, TaskEventType } from './types.js';
import type { TaskEventBus } from './task-events.js';
import type { TaskStore } from './task-store.js';

/** 合法状态迁移表。 */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['queued', 'cancelled'],
  queued: ['running', 'cancelled', 'pending'],
  running: ['paused', 'completed', 'failed', 'cancelled', 'timeout'],
  paused: ['running', 'cancelled', 'failed', 'timeout'],
  completed: [],
  failed: ['queued'], // 允许重试：从 failed 重新排队
  cancelled: [],
  timeout: ['queued'], // 允许重试
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface LifecycleTransitionResult {
  ok: boolean;
  task: Task | null;
  reason?: string;
}

export class TaskLifecycle {
  constructor(
    private store: TaskStore,
    private events?: TaskEventBus,
  ) {}

  /** 应用状态迁移（含校验）。 */
  transition(taskId: string, to: TaskStatus, extra: Partial<Task> = {}): LifecycleTransitionResult {
    const task = this.store.get(taskId);
    if (!task) return { ok: false, task: null, reason: 'task not found' };
    if (task.status === to) return { ok: true, task };
    if (isTerminalStatus(task.status) && !canTransition(task.status, to)) {
      return { ok: false, task, reason: `terminal status ${task.status} cannot move to ${to}` };
    }
    if (!canTransition(task.status, to)) {
      return { ok: false, task, reason: `invalid transition ${task.status} -> ${to}` };
    }
    const patch: Partial<Task> = { status: to, ...extra };
    const updated = this.store.update(taskId, patch);
    this.emit(to, taskId);
    return { ok: true, task: updated };
  }

  queue(taskId: string): LifecycleTransitionResult {
    return this.transition(taskId, 'queued', { queuedAt: nowIso() });
  }

  start(taskId: string): LifecycleTransitionResult {
    return this.transition(taskId, 'running', { startedAt: nowIso(), error: null });
  }

  pause(taskId: string): LifecycleTransitionResult {
    const task = this.store.get(taskId);
    if (!task) return { ok: false, task: null, reason: 'task not found' };
    if (!isPausableStatus(task.status)) {
      return { ok: false, task, reason: 'only running task can be paused' };
    }
    return this.transition(taskId, 'paused');
  }

  resume(taskId: string): LifecycleTransitionResult {
    return this.transition(taskId, 'running');
  }

  complete(taskId: string): LifecycleTransitionResult {
    return this.transition(taskId, 'completed', { completedAt: nowIso(), progress: { percent: 100 } });
  }

  fail(taskId: string, error: string): LifecycleTransitionResult {
    return this.transition(taskId, 'failed', { completedAt: nowIso(), error });
  }

  timeout(taskId: string): LifecycleTransitionResult {
    return this.transition(taskId, 'timeout', { completedAt: nowIso(), error: 'timeout' });
  }

  cancel(taskId: string, reason?: string): LifecycleTransitionResult {
    return this.transition(taskId, 'cancelled', { completedAt: nowIso(), error: reason ?? 'cancelled' });
  }

  /** 重新排队（用于重试）。 */
  requeue(taskId: string): LifecycleTransitionResult {
    return this.transition(taskId, 'queued', { queuedAt: nowIso() });
  }

  private emit(to: TaskStatus, taskId: string): void {
    const map: Partial<Record<TaskStatus, TaskEventType>> = {
      queued: 'task:queued',
      running: 'task:started',
      paused: 'task:paused',
      completed: 'task:completed',
      failed: 'task:failed',
      cancelled: 'task:cancelled',
      timeout: 'task:timeout',
    };
    const type = map[to];
    if (type && this.events) {
      this.events.emit(type, taskId);
    }
  }
}
