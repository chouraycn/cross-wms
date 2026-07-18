/**
 * tasks/task-store.ts — 任务存储
 *
 * 内存存储 + 索引（status / priority / tag），支持查询与持久化快照。
 */
import { logger } from '../../logger.js';
import { genTaskId, nowIso, normalizePriority } from './types.js';
import type { Task, TaskOptions, TaskPriority, TaskStatus } from './types.js';

export interface TaskQuery {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  tag?: string;
  ids?: string[];
}

export class TaskStore {
  private tasks = new Map<string, Task>();
  private byStatus = new Map<TaskStatus, Set<string>>();
  private byPriority = new Map<TaskPriority, Set<string>>();
  private byTag = new Map<string, Set<string>>();

  constructor() {
    for (const s of [
      'pending',
      'queued',
      'running',
      'paused',
      'completed',
      'failed',
      'cancelled',
      'timeout',
    ] as TaskStatus[]) {
      this.byStatus.set(s, new Set());
    }
    for (const p of ['critical', 'high', 'medium', 'low'] as TaskPriority[]) {
      this.byPriority.set(p, new Set());
    }
  }

  /** 创建并持久化任务。 */
  create(opts: TaskOptions): Task {
    const id = opts.id ?? genTaskId();
    if (this.tasks.has(id)) {
      throw new Error(`Task id 已存在: ${id}`);
    }
    const task: Task = {
      id,
      name: opts.name,
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      status: 'pending',
      priority: normalizePriority(opts.priority),
      dependencies: opts.dependencies ? [...opts.dependencies] : [],
      ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
      timeoutMs: opts.timeoutMs ?? 0,
      maxRetries: opts.maxRetries ?? 0,
      retryCount: 0,
      tags: opts.tags ? [...opts.tags] : [],
      metadata: opts.metadata ? { ...opts.metadata } : {},
      createdAt: nowIso(),
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      progress: null,
      result: null,
      error: null,
    };
    this.index(task);
    this.tasks.set(id, task);
    return task;
  }

  /** 从已有对象插入（用于反序列化/迁移）。 */
  insert(task: Task): void {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task id 已存在: ${task.id}`);
    }
    this.index(task);
    this.tasks.set(task.id, task);
  }

  get(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.tasks.has(id);
  }

  /** 更新任务字段并维护索引。返回更新后的任务。 */
  update(id: string, patch: Partial<Task>): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    const prevStatus = task.status;
    const prevPriority = task.priority;
    const prevTags = new Set(task.tags);
    // 应用 patch（不允许改 id）
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'id') continue;
      (task as unknown as Record<string, unknown>)[k] = v;
    }
    // 重建索引差异
    if (patch.status && patch.status !== prevStatus) {
      this.byStatus.get(prevStatus)?.delete(id);
      this.byStatus.get(task.status)?.add(id);
    }
    if (patch.priority && patch.priority !== prevPriority) {
      this.byPriority.get(prevPriority)?.delete(id);
      this.byPriority.get(task.priority)?.add(id);
    }
    if (patch.tags) {
      for (const t of prevTags) {
        if (!task.tags.includes(t)) this.byTag.get(t)?.delete(id);
      }
      for (const t of task.tags) {
        if (!prevTags.has(t)) {
          if (!this.byTag.has(t)) this.byTag.set(t, new Set());
          this.byTag.get(t)!.add(id);
        }
      }
    }
    return task;
  }

  delete(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    this.deindex(task);
    this.tasks.delete(id);
    return true;
  }

  /** 按条件查询。 */
  query(q: TaskQuery = {}): Task[] {
    let ids: Set<string> | null = null;
    if (q.status) {
      const arr = Array.isArray(q.status) ? q.status : [q.status];
      ids = this.intersect(ids, arr.map(s => this.byStatus.get(s) ?? new Set()));
    }
    if (q.priority) {
      const arr = Array.isArray(q.priority) ? q.priority : [q.priority];
      ids = this.intersect(ids, arr.map(p => this.byPriority.get(p) ?? new Set()));
    }
    if (q.tag) {
      ids = this.intersect(ids, [this.byTag.get(q.tag) ?? new Set()]);
    }
    if (q.ids) {
      ids = this.intersect(ids, [new Set(q.ids)]);
    }
    if (ids === null) return [...this.tasks.values()];
    return [...ids].map(id => this.tasks.get(id)!).filter(Boolean);
  }

  all(): Task[] {
    return [...this.tasks.values()];
  }

  get size(): number {
    return this.tasks.size;
  }

  /** 按状态计数。 */
  countByStatus(): Record<TaskStatus, number> {
    const out = {} as Record<TaskStatus, number>;
    for (const [s, set] of this.byStatus) out[s] = set.size;
    return out;
  }

  /** 导出快照（深拷贝 JSON）。 */
  snapshot(): Task[] {
    return JSON.parse(JSON.stringify(this.all())) as Task[];
  }

  /** 清空。 */
  clear(): void {
    this.tasks.clear();
    for (const s of this.byStatus.values()) s.clear();
    for (const p of this.byPriority.values()) p.clear();
    this.byTag.clear();
  }

  // ---------- 内部 ----------

  private index(task: Task): void {
    this.byStatus.get(task.status)?.add(task.id);
    this.byPriority.get(task.priority)?.add(task.id);
    for (const t of task.tags) {
      if (!this.byTag.has(t)) this.byTag.set(t, new Set());
      this.byTag.get(t)!.add(task.id);
    }
  }

  private deindex(task: Task): void {
    this.byStatus.get(task.status)?.delete(task.id);
    this.byPriority.get(task.priority)?.delete(task.id);
    for (const t of task.tags) this.byTag.get(t)?.delete(task.id);
  }

  private intersect(
    current: Set<string> | null,
    sets: Set<string>[],
  ): Set<string> | null {
    if (sets.length === 0) return current;
    const merged = new Set<string>();
    for (const s of sets) for (const id of s) merged.add(id);
    if (current === null) return merged;
    const result = new Set<string>();
    for (const id of current) if (merged.has(id)) result.add(id);
    return result;
  }
}

/** 仅用于日志打点；保留以备未来扩展。 */
export function logStoreEvent(event: string, taskId: string): void {
  logger.debug(`[TaskStore] ${event} task=${taskId}`);
}
