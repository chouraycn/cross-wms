/**
 * tasks/task-progress.ts — 进度追踪
 *
 * - 百分比 / 阶段 / 子任务聚合
 * - 与 Task 对象解耦的 ProgressTracker
 */
import { clampPercent } from './types.js';
import type { Task, TaskProgress } from './types.js';

/** 合并进度：新值覆盖旧值，percent 钳制到 [0,100]。 */
export function mergeProgress(
  base: TaskProgress | null,
  patch: Partial<TaskProgress>,
): TaskProgress {
  const next: TaskProgress = {
    percent: base?.percent ?? 0,
    ...(base?.phase !== undefined ? { phase: base.phase } : {}),
    ...(base?.subtasks !== undefined ? { subtasks: { ...base.subtasks } } : {}),
    ...(base?.message !== undefined ? { message: base.message } : {}),
  };
  if (patch.percent !== undefined) next.percent = clampPercent(patch.percent);
  if (patch.phase !== undefined) next.phase = patch.phase;
  if (patch.subtasks !== undefined) next.subtasks = { ...patch.subtasks };
  if (patch.message !== undefined) next.message = patch.message;
  return next;
}

/** 从子任务列表聚合进度（按完成数/总数）。 */
export function aggregateSubtaskProgress(
  subtasks: Array<{ status: string }>,
  phase?: string,
): TaskProgress {
  const total = subtasks.length;
  let completed = 0;
  let failed = 0;
  for (const s of subtasks) {
    if (s.status === 'completed') completed++;
    else if (s.status === 'failed' || s.status === 'cancelled' || s.status === 'timeout') failed++;
  }
  const done = completed + failed;
  const percent = total === 0 ? 0 : clampPercent((done / total) * 100);
  return {
    percent,
    ...(phase !== undefined ? { phase } : {}),
    subtasks: { total, completed, failed },
  };
}

/**
 * 进度追踪器：与具体 Task 解耦，便于多场景复用。
 * 可附加到任意任务对象（setTask）。
 */
export class ProgressTracker {
  private task: Task | null = null;
  private current: TaskProgress | null = null;

  attach(task: Task): void {
    this.task = task;
    if (task.progress) this.current = { ...task.progress };
  }

  detach(): Task | null {
    const t = this.task;
    this.task = null;
    return t;
  }

  report(patch: Partial<TaskProgress>): TaskProgress {
    this.current = mergeProgress(this.current, patch);
    if (this.task) this.task.progress = this.current;
    return this.current;
  }

  setPercent(percent: number, message?: string): TaskProgress {
    return this.report({ percent, ...(message !== undefined ? { message } : {}) });
  }

  setPhase(phase: string): TaskProgress {
    return this.report({ phase });
  }

  complete(message?: string): TaskProgress {
    return this.report({ percent: 100, ...(message !== undefined ? { message } : {}) });
  }

  snapshot(): TaskProgress | null {
    return this.current ? { ...this.current } : null;
  }

  reset(): void {
    this.current = null;
    if (this.task) this.task.progress = null;
  }
}
