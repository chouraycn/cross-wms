/**
 * tasks/task-queue.ts — 任务队列
 *
 * - PriorityQueue：基于二叉堆的优先级队列（高优先 + FIFO 稳定）
 * - DelayedQueue：到点才能出队的延迟队列
 * - DeadLetterQueue：超过最大重试/被拒绝的任务
 */
import { PRIORITY_WEIGHT } from './types.js';
import type { Task, TaskPriority } from './types.js';

// ===================== 优先级队列（二叉堆） =====================

interface HeapEntry {
  task: Task;
  seq: number; // 入队序号，保证同优先级 FIFO
}

export class PriorityQueue {
  private heap: HeapEntry[] = [];
  private seq = 0;
  private seen = new Set<string>();

  /** 入队；重复 ID 返回 false。 */
  enqueue(task: Task): boolean {
    if (this.seen.has(task.id)) return false;
    this.seen.add(task.id);
    this.heap.push({ task, seq: this.seq++ });
    this.bubbleUp(this.heap.length - 1);
    return true;
  }

  /** 出队最高优先级（同优先级 FIFO）。 */
  dequeue(): Task | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    this.seen.delete(top.task.id);
    return top.task;
  }

  /** 查看队首但不移除。 */
  peek(): Task | null {
    return this.heap.length === 0 ? null : this.heap[0].task;
  }

  get size(): number {
    return this.heap.length;
  }

  /** 移除指定任务（如被取消）。 */
  remove(taskId: string): boolean {
    const idx = this.heap.findIndex(e => e.task.id === taskId);
    if (idx < 0) return false;
    const last = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = last;
      this.bubbleUp(idx);
      this.sinkDown(idx);
    }
    this.seen.delete(taskId);
    return true;
  }

  /** 是否包含某任务。 */
  has(taskId: string): boolean {
    return this.seen.has(taskId);
  }

  /** 清空。 */
  clear(): void {
    this.heap = [];
    this.seen.clear();
    this.seq = 0;
  }

  /** 转为数组（不保证顺序）。 */
  toArray(): Task[] {
    return this.heap.map(e => e.task);
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[parent]) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.compare(this.heap[l], this.heap[smallest]) < 0) smallest = l;
      if (r < n && this.compare(this.heap[r], this.heap[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }

  /** 排序：优先级高（权重大的）在前；同优先级 seq 小的在前。 */
  private compare(a: HeapEntry, b: HeapEntry): number {
    const wa = PRIORITY_WEIGHT[a.task.priority as TaskPriority];
    const wb = PRIORITY_WEIGHT[b.task.priority as TaskPriority];
    if (wa !== wb) return wb - wa; // 大权重在前 -> 负
    return a.seq - b.seq;
  }
}

// ===================== 延迟队列 =====================

interface DelayedEntry {
  task: Task;
  readyAt: number; // ms timestamp
}

export class DelayedQueue {
  private entries: DelayedEntry[] = [];

  enqueue(task: Task, delayMs: number): void {
    this.entries.push({ task, readyAt: Date.now() + Math.max(0, delayMs) });
  }

  /** 取出所有已就绪的任务（按就绪时间排序）。 */
  dequeueReady(now: number = Date.now()): Task[] {
    const ready: Task[] = [];
    const remaining: DelayedEntry[] = [];
    for (const e of this.entries) {
      if (e.readyAt <= now) ready.push(e.task);
      else remaining.push(e);
    }
    this.entries = remaining;
    ready.sort((a, b) => 0); // 保持入队顺序
    return ready;
  }

  /** 查看下一个就绪时间；队空返回 null。 */
  nextReadyAt(): number | null {
    if (this.entries.length === 0) return null;
    return Math.min(...this.entries.map(e => e.readyAt));
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

// ===================== 死信队列 =====================

export interface DeadLetterEntry {
  task: Task;
  reason: string;
  enqueuedAt: number;
}

export class DeadLetterQueue {
  private entries: DeadLetterEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  enqueue(task: Task, reason: string): void {
    this.entries.push({ task, reason, enqueuedAt: Date.now() });
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  get size(): number {
    return this.entries.length;
  }

  list(): DeadLetterEntry[] {
    return [...this.entries];
  }

  /** 重新投递：从死信队列移除并返回任务。 */
  redeliver(taskId: string): Task | null {
    const idx = this.entries.findIndex(e => e.task.id === taskId);
    if (idx < 0) return null;
    const [entry] = this.entries.splice(idx, 1);
    return entry.task;
  }

  clear(): void {
    this.entries = [];
  }
}
