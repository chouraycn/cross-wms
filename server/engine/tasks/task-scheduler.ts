/**
 * tasks/task-scheduler.ts — 任务调度器
 *
 * 协调 store + 优先级队列 + 依赖解析 + 并发控制：
 * - enqueue：将 pending 任务入队
 * - pickReady：在并发度限制内挑选前置已完成的任务（按优先级）
 * - markRunning / release：维护运行中集合
 */
import { logger } from '../../logger.js';
import { buildGraphFromTasks, getReadyTasks } from './task-dependency.js';
import { PriorityQueue } from './task-queue.js';
import type { TaskStore } from './task-store.js';
import type { Task } from './types.js';
import type { TaskEventBus } from './task-events.js';

export interface SchedulerOptions {
  concurrency?: number;
  events?: TaskEventBus;
}

export interface PickedTask {
  task: Task;
}

export class TaskScheduler {
  private queue = new PriorityQueue();
  private running = new Set<string>();
  private graph;
  private concurrency: number;
  private events?: TaskEventBus;

  constructor(private store: TaskStore, opts: SchedulerOptions = {}) {
    this.concurrency = opts.concurrency ?? 4;
    this.events = opts.events;
    this.graph = buildGraphFromTasks(store.all());
  }

  /** 将任务加入调度队列（状态置为 queued）。 */
  enqueue(taskId: string): boolean {
    const task = this.store.get(taskId);
    if (!task) return false;
    if (task.status !== 'pending' && task.status !== 'queued') return false;
    // 重建图以纳入新任务
    this.rebuildGraph();
    if (task.status === 'pending') {
      this.store.update(taskId, { status: 'queued', queuedAt: new Date().toISOString() });
    }
    const ok = this.queue.enqueue(task);
    if (ok) this.events?.emit('task:queued', taskId);
    return ok;
  }

  /** 在并发度限制内挑选前置已完成的任务（按优先级顺序）。 */
  pickReady(max?: number): Task[] {
    const slots = this.concurrency - this.running.size;
    if (slots <= 0) return [];
    const limit = Math.min(slots, max ?? slots);
    const ready: Task[] = [];
    const tasksMap = new Map(this.store.all().map(t => [t.id, t] as const));
    const readyIds = new Set(getReadyTasks(this.graph, tasksMap).map(t => t.id));
    // 从优先级队列中按序取出且满足就绪条件
    const skipped: Task[] = [];
    let count = 0;
    while (count < limit) {
      const task = this.queue.dequeue();
      if (!task) break;
      if (this.running.has(task.id)) {
        // 已在运行，跳过
        continue;
      }
      if (readyIds.has(task.id)) {
        ready.push(task);
        this.running.add(task.id);
        count++;
      } else {
        skipped.push(task);
      }
    }
    // 未就绪的重新入队
    for (const t of skipped) this.queue.enqueue(t);
    return ready;
  }

  /** 标记任务开始运行。 */
  markRunning(taskId: string): void {
    this.running.add(taskId);
  }

  /** 释放运行槽位（任务结束）。 */
  release(taskId: string): void {
    this.running.delete(taskId);
  }

  /** 从队列移除（如取消）。 */
  dequeue(taskId: string): boolean {
    return this.queue.remove(taskId);
  }

  /** 当前运行数。 */
  get runningCount(): number {
    return this.running.size;
  }

  /** 队列长度。 */
  get queueSize(): number {
    return this.queue.size;
  }

  get concurrencyLimit(): number {
    return this.concurrency;
  }

  /** 是否空闲（无运行 + 队列空）。 */
  isIdle(): boolean {
    return this.running.size === 0 && this.queue.size === 0;
  }

  /** 设置并发度。 */
  setConcurrency(n: number): void {
    if (n <= 0) throw new Error('concurrency must be positive');
    this.concurrency = n;
  }

  /** 重建依赖图（任务集变化后调用）。 */
  rebuildGraph(): void {
    this.graph = buildGraphFromTasks(this.store.all());
    logger.debug(`[Scheduler] rebuild graph, tasks=${this.store.size}`);
  }

  /** 清空调度状态。 */
  clear(): void {
    this.queue.clear();
    this.running.clear();
  }
}
