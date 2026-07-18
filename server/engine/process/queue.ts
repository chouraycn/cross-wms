/**
 * 任务队列
 *
 * 支持优先级、并发限制与基本的速率限制。
 */

import type { ProcessPriority } from './types.js';

/** 队列条目 */
export interface QueueEntry<T> {
  id: string;
  task: () => Promise<T>;
  priority: ProcessPriority;
  enqueuedAt: number;
  sequence: number;
}

/** 入队选项 */
export interface EnqueueOptions {
  priority?: ProcessPriority;
}

/** 队列状态 */
export interface QueueStatus {
  queuedCount: number;
  activeCount: number;
  capacity: number;
}

const PRIORITY_WEIGHT: Record<ProcessPriority, number> = {
  critical: 4,
  normal: 2,
  low: 1,
  background: 0,
};

/**
 * 任务队列
 *
 * 单车道 + 并发上限。FIFO + 优先级：
 * - 优先级高的先出队
 * - 同优先级按入队顺序
 *
 * 任务调度按 acquire / release 语义；调用者负责执行任务。
 */
export class TaskQueue<T = unknown> {
  private readonly queue: Array<QueueEntry<T>> = [];
  private readonly active = new Set<string>();
  private readonly capacity: number;
  private sequence = 0;
  private waiters: Array<() => void> = [];

  constructor(capacity: number = 1) {
    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new Error('TaskQueue capacity must be a positive finite number');
    }
    this.capacity = Math.floor(capacity);
  }

  /** 入队 */
  enqueue(id: string, task: () => Promise<T>, options?: EnqueueOptions): void {
    if (this.queue.some((e) => e.id === id) || this.active.has(id)) {
      throw new Error(`Queue entry id already exists: ${id}`);
    }
    const entry: QueueEntry<T> = {
      id,
      task,
      priority: options?.priority ?? 'normal',
      enqueuedAt: Date.now(),
      sequence: this.sequence++,
    };
    this.insertSorted(entry);
    this.pump();
  }

  /** 移除未开始的条目（按 id） */
  cancel(id: string): boolean {
    const idx = this.queue.findIndex((e) => e.id === id);
    if (idx < 0) {
      return false;
    }
    this.queue.splice(idx, 1);
    return true;
  }

  /** 阻塞等待可用槽位，返回 release 函数 */
  async acquire(id: string): Promise<() => void> {
    while (this.active.size >= this.capacity) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active.add(id);
    return () => this.release(id);
  }

  /** 等待并取下一个条目（用于手动驱动模式） */
  async dequeue(): Promise<QueueEntry<T>> {
    while (this.queue.length === 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    return this.queue.shift() as QueueEntry<T>;
  }

  /** 释放槽位 */
  release(id: string): void {
    if (!this.active.delete(id)) {
      return;
    }
    this.pump();
  }

  /** 当前队列大小 */
  size(): number {
    return this.queue.length;
  }

  /** 活跃任务数 */
  activeCount(): number {
    return this.active.size;
  }

  /** 是否包含 id */
  has(id: string): boolean {
    return this.queue.some((e) => e.id === id) || this.active.has(id);
  }

  /** 状态快照 */
  status(): QueueStatus {
    return {
      queuedCount: this.queue.length,
      activeCount: this.active.size,
      capacity: this.capacity,
    };
  }

  /** 清空所有等待中的条目 */
  clear(): number {
    const n = this.queue.length;
    this.queue.length = 0;
    return n;
  }

  /** 尝试调度（如果有空闲槽位且有等待者，唤醒之） */
  private pump(): void {
    const wake = this.waiters;
    this.waiters = [];
    for (const w of wake) {
      w();
    }
  }

  private insertSorted(entry: QueueEntry<T>): void {
    const w = PRIORITY_WEIGHT[entry.priority];
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midW = PRIORITY_WEIGHT[this.queue[mid].priority];
      if (midW > w || (midW === w && this.queue[mid].sequence < entry.sequence)) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.queue.splice(lo, 0, entry);
  }
}
