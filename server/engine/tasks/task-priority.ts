/**
 * tasks/task-priority.ts — 优先级管理
 *
 * - 比较 / 排序
 * - 动态调整（提升 / 降级 / 钳制）
 * - 优先级继承：阻塞者提升到被阻塞者的最高优先级
 */
import { PRIORITY_WEIGHT, PRIORITY_ORDER, normalizePriority } from './types.js';
import type { Task, TaskPriority } from './types.js';

export interface PriorityCompareResult {
  a: TaskPriority;
  b: TaskPriority;
  /** >0 表示 a 更高，<0 表示 b 更高，0 相等 */
  diff: number;
}

/** 比较两个优先级，返回权重差。 */
export function comparePriority(a: TaskPriority, b: TaskPriority): number {
  return PRIORITY_WEIGHT[a] - PRIORITY_WEIGHT[b];
}

/** 比较两个任务的优先级（高优先）。 */
export function compareTaskPriority(a: Task, b: Task): number {
  return comparePriority(a.priority, b.priority);
}

/** 按优先级从高到低排序（原地）。 */
export function sortByPriority<T extends { priority: TaskPriority }>(list: T[]): T[] {
  return list.sort((a, b) => comparePriority(b.priority, a.priority));
}

/**
 * 动态调整优先级，沿 PRIORITY_ORDER 在 n 步内移动。
 * step > 0 提升，step < 0 降级，自动钳制到边界。
 */
export function shiftPriority(p: TaskPriority, step: number): TaskPriority {
  const idx = PRIORITY_ORDER.indexOf(p);
  if (idx < 0) return 'medium';
  let next = idx - step; // 越靠前权重越高
  if (next < 0) next = 0;
  if (next >= PRIORITY_ORDER.length) next = PRIORITY_ORDER.length - 1;
  return PRIORITY_ORDER[next];
}

/** 提升到更高优先级（不能超过 critical）。 */
export function promotePriority(p: TaskPriority): TaskPriority {
  return shiftPriority(p, 1);
}

/** 降级到更低优先级（不能低于 low）。 */
export function demotePriority(p: TaskPriority): TaskPriority {
  return shiftPriority(p, -1);
}

/**
 * 优先级继承：当 task 被一组 blockedBy 阻塞时，
 * 将 task.priority 提升为 blockedBy 中最高的优先级（仅当更高时）。
 * 返回是否发生了提升。
 */
export function inheritPriority(
  task: Task,
  blockedBy: Task[],
): boolean {
  if (blockedBy.length === 0) return false;
  let highest: TaskPriority = task.priority;
  for (const blocker of blockedBy) {
    if (comparePriority(blocker.priority, highest) > 0) {
      highest = blocker.priority;
    }
  }
  if (highest !== task.priority) {
    task.priority = highest;
    return true;
  }
  return false;
}

/** 钳制任意输入为合法优先级。 */
export function clampPriority(p: unknown): TaskPriority {
  return normalizePriority(p);
}

/** 详细比较结果（便于断言/日志）。 */
export function detailedCompare(a: TaskPriority, b: TaskPriority): PriorityCompareResult {
  return { a, b, diff: comparePriority(a, b) };
}
