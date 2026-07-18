/**
 * tasks/task-validator.ts — 任务验证器
 *
 * 校验 TaskOptions / Task 的结构合法性：
 * - 必填字段
 * - 优先级合法性
 * - timeoutMs/maxRetries 非负
 * - dependencies 不含自环、不含循环（对一组任务）
 */
import { normalizePriority } from './types.js';
import { hasCycle, buildGraphFromTasks } from './task-dependency.js';
import type { Task, TaskOptions, TaskPriority } from './types.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const VALID_PRIORITIES: ReadonlySet<string> = new Set(['critical', 'high', 'medium', 'low']);
const VALID_STATUSES: ReadonlySet<string> = new Set([
  'pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout',
]);

/** 校验单个 TaskOptions。 */
export function validateOptions(opts: TaskOptions): ValidationResult {
  const errors: string[] = [];
  if (!opts || typeof opts !== 'object') {
    return { ok: false, errors: ['options must be an object'] };
  }
  if (!opts.name || typeof opts.name !== 'string' || opts.name.trim().length === 0) {
    errors.push('name is required and must be non-empty string');
  }
  if (opts.priority !== undefined && !VALID_PRIORITIES.has(opts.priority)) {
    errors.push(`invalid priority: ${opts.priority}`);
  }
  if (opts.timeoutMs !== undefined && (typeof opts.timeoutMs !== 'number' || opts.timeoutMs < 0)) {
    errors.push('timeoutMs must be a non-negative number');
  }
  if (opts.maxRetries !== undefined && (typeof opts.maxRetries !== 'number' || opts.maxRetries < 0 || !Number.isInteger(opts.maxRetries))) {
    errors.push('maxRetries must be a non-negative integer');
  }
  if (opts.dependencies !== undefined) {
    if (!Array.isArray(opts.dependencies)) {
      errors.push('dependencies must be an array');
    } else {
      for (const d of opts.dependencies) {
        if (typeof d !== 'string' || d.length === 0) {
          errors.push('each dependency must be a non-empty string');
          break;
        }
      }
    }
  }
  if (opts.tags !== undefined && !Array.isArray(opts.tags)) {
    errors.push('tags must be an array');
  }
  return { ok: errors.length === 0, errors };
}

/** 校验单个 Task 对象（结构）。 */
export function validateTask(task: Task): ValidationResult {
  const errors: string[] = [];
  if (!task || typeof task !== 'object') {
    return { ok: false, errors: ['task must be an object'] };
  }
  if (!task.id || typeof task.id !== 'string') errors.push('id is required');
  if (!task.name || typeof task.name !== 'string') errors.push('name is required');
  if (!VALID_STATUSES.has(task.status)) errors.push(`invalid status: ${task.status}`);
  if (!VALID_PRIORITIES.has(task.priority)) errors.push(`invalid priority: ${task.priority}`);
  if (typeof task.timeoutMs !== 'number' || task.timeoutMs < 0) errors.push('timeoutMs must be non-negative');
  if (typeof task.maxRetries !== 'number' || task.maxRetries < 0) errors.push('maxRetries must be non-negative');
  if (typeof task.retryCount !== 'number' || task.retryCount < 0) errors.push('retryCount must be non-negative');
  if (task.retryCount > task.maxRetries) errors.push('retryCount cannot exceed maxRetries');
  if (!Array.isArray(task.dependencies)) {
    errors.push('dependencies must be an array');
  } else if (task.dependencies.includes(task.id)) {
    errors.push('task cannot depend on itself');
  }
  if (!Array.isArray(task.tags)) errors.push('tags must be an array');
  if (!task.createdAt || typeof task.createdAt !== 'string') errors.push('createdAt is required');
  return { ok: errors.length === 0, errors };
}

/** 校验一组任务：结构 + 无循环依赖。 */
export function validateTaskSet(tasks: Task[]): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of tasks) {
    const r = validateTask(t);
    if (!r.ok) errors.push(`[${t.id ?? 'unknown'}] ${r.errors.join('; ')}`);
    if (t.id) {
      if (ids.has(t.id)) errors.push(`duplicate task id: ${t.id}`);
      ids.add(t.id);
    }
  }
  // 引用完整性
  for (const t of tasks) {
    for (const d of t.dependencies ?? []) {
      if (!ids.has(d)) errors.push(`[${t.id}] dependency not found: ${d}`);
    }
  }
  // 循环检测
  if (hasCycle(buildGraphFromTasks(tasks))) {
    errors.push('circular dependency detected');
  }
  return { ok: errors.length === 0, errors };
}

/** 规范化 options（修正非法字段为合法默认值，便于容错创建）。 */
export function sanitizeOptions(opts: TaskOptions): TaskOptions {
  return {
    ...opts,
    priority: opts.priority && VALID_PRIORITIES.has(opts.priority)
      ? (opts.priority as TaskPriority)
      : normalizePriority(opts.priority),
    timeoutMs: typeof opts.timeoutMs === 'number' && opts.timeoutMs >= 0 ? opts.timeoutMs : 0,
    maxRetries: typeof opts.maxRetries === 'number' && opts.maxRetries >= 0 ? Math.floor(opts.maxRetries) : 0,
  };
}
