/**
 * tasks/task-serialization.ts — 序列化 / 反序列化
 *
 * 带 schema 版本的 JSON 序列化，支持快照导出与恢复。
 */
import { normalizePriority } from './types.js';
import type { Task, TaskPriority, TaskStatus } from './types.js';

export const SERIALIZATION_VERSION = 1;

export interface SerializedTaskEnvelope {
  version: number;
  task: unknown;
}

/** 序列化单个任务。 */
export function serializeTask(task: Task): string {
  const envelope: SerializedTaskEnvelope = { version: SERIALIZATION_VERSION, task };
  return JSON.stringify(envelope);
}

/** 序列化任务列表。 */
export function serializeTasks(tasks: Task[]): string {
  const envelope = { version: SERIALIZATION_VERSION, tasks };
  return JSON.stringify(envelope);
}

/** 反序列化单个任务；非法返回 null。 */
export function deserializeTask(json: string): Task | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const env = parsed as SerializedTaskEnvelope;
  if (!env || typeof env !== 'object' || env.version !== SERIALIZATION_VERSION) return null;
  return reviveTask(env.task);
}

/** 反序列化任务列表；非法返回空数组。 */
export function deserializeTasks(json: string): Task[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const env = parsed as { version: number; tasks: unknown[] };
  if (!env || env.version !== SERIALIZATION_VERSION || !Array.isArray(env.tasks)) return [];
  return env.tasks.map(reviveTask).filter((t): t is Task => !!t);
}

/** 复活一个松散对象为合法 Task（补全缺失字段、规范化枚举）。 */
export function reviveTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const name = r.name;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  const status = VALID_STATUSES.has(r.status as string) ? (r.status as TaskStatus) : 'pending';
  const priority = normalizePriority(r.priority);
  const task: Task = {
    id,
    name,
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
    status,
    priority,
    dependencies: Array.isArray(r.dependencies) ? (r.dependencies as string[]) : [],
    ...(r.payload !== undefined ? { payload: r.payload } : {}),
    timeoutMs: typeof r.timeoutMs === 'number' ? r.timeoutMs : 0,
    maxRetries: typeof r.maxRetries === 'number' ? r.maxRetries : 0,
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

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout',
]);

/** 深拷贝任务（基于序列化）。 */
export function cloneTask(task: Task): Task {
  return JSON.parse(JSON.stringify(task)) as Task;
}
