/**
 * tasks/task-migration.ts — 任务迁移
 *
 * 将旧版本（v0）的松散任务对象迁移到当前 schema。
 * - 补全缺失字段
 * - 规范化枚举（status/priority）
 * - 旧字段名映射（deps -> dependencies, retries -> maxRetries）
 * - 幂等：已是新 schema 则原样返回
 */
import { normalizePriority } from './types.js';
import type { Task, TaskStatus } from './types.js';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout',
]);

/** 迁移单个任务对象。 */
export function migrateTask(raw: unknown): Task {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : `migrated_${Math.random().toString(36).slice(2, 10)}`;
  const name = typeof r.name === 'string' ? r.name : (typeof r.title === 'string' ? r.title : 'unnamed');

  // 旧字段名映射
  const deps = Array.isArray(r.dependencies)
    ? (r.dependencies as string[])
    : Array.isArray((r as Record<string, unknown>).deps)
      ? ((r as Record<string, unknown>).deps as string[])
      : [];

  const maxRetriesRaw = r.maxRetries ?? (r as Record<string, unknown>).retries ?? 0;

  const status = VALID_STATUSES.has(r.status as string) ? (r.status as TaskStatus) : 'pending';
  const priority = normalizePriority(r.priority ?? (r as Record<string, unknown>).pri);

  const task: Task = {
    id,
    name,
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
    status,
    priority,
    dependencies: deps.filter((d): d is string => typeof d === 'string'),
    ...(r.payload !== undefined ? { payload: r.payload } : {}),
    timeoutMs: typeof r.timeoutMs === 'number' && r.timeoutMs >= 0 ? r.timeoutMs : (typeof r.timeout === 'number' ? r.timeout : 0),
    maxRetries: typeof maxRetriesRaw === 'number' && maxRetriesRaw >= 0 ? Math.floor(maxRetriesRaw) : 0,
    retryCount: typeof r.retryCount === 'number' ? r.retryCount : 0,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    metadata: r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {},
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
    queuedAt: typeof r.queuedAt === 'string' ? r.queuedAt : null,
    startedAt: typeof r.startedAt === 'string' ? r.startedAt : null,
    completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
    progress: r.progress && typeof r.progress === 'object' ? (r.progress as Task['progress']) : null,
    result: r.result && typeof r.result === 'object' ? (r.result as Task['result']) : null,
    error: typeof r.error === 'string' ? r.error : null,
  };
  return task;
}

/** 批量迁移。 */
export function migrateTasks(raws: unknown[]): Task[] {
  return raws.map(migrateTask);
}

/** 是否需要迁移：检查是否存在旧字段或缺失新字段。 */
export function needsMigration(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return true;
  if (!VALID_STATUSES.has(r.status as string)) return true;
  if ('deps' in r || 'retries' in r || 'pri' in r || 'timeout' in r || 'title' in r) return true;
  return false;
}

/** 迁移并保证幂等：连续两次迁移结果一致。 */
export function migrateIdempotent(raw: unknown): Task {
  return migrateTask(migrateTask(raw));
}
