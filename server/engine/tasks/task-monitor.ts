/**
 * tasks/task-monitor.ts — 任务监控
 *
 * - 当前运行任务快照
 * - 资源使用（并发数 / 内存估算 / 历史峰值）
 * - 进度与状态历史
 */
import { isActiveStatus, isTerminalStatus } from './types.js';
import type { Task, TaskStatus } from './types.js';

export interface MonitorSnapshot {
  running: number;
  queued: number;
  paused: number;
  terminal: number;
  total: number;
  peakConcurrency: number;
  estimatedMemoryBytes: number;
}

export interface ResourceSample {
  timestamp: number;
  running: number;
  queued: number;
}

export class TaskMonitor {
  private peakConcurrency = 0;
  private history: ResourceSample[] = [];
  private maxHistory: number;
  private startTimeByTask = new Map<string, number>();
  private sizeByTask = new Map<string, number>();

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  /** 采样：根据当前任务列表更新监控状态。 */
  sample(tasks: Task[], now: number = Date.now()): MonitorSnapshot {
    let running = 0;
    let queued = 0;
    let paused = 0;
    let terminal = 0;
    let estimatedMemoryBytes = 0;
    for (const t of tasks) {
      if (t.status === 'running') running++;
      else if (t.status === 'queued') queued++;
      else if (t.status === 'paused') paused++;
      if (isTerminalStatus(t.status)) terminal++;
      estimatedMemoryBytes += this.estimateTaskSize(t);
      if (t.status === 'running' && !this.startTimeByTask.has(t.id)) {
        this.startTimeByTask.set(t.id, now);
      }
      if (!isActiveStatus(t.status)) {
        this.startTimeByTask.delete(t.id);
      }
    }
    if (running > this.peakConcurrency) this.peakConcurrency = running;
    this.history.push({ timestamp: now, running, queued });
    if (this.history.length > this.maxHistory) this.history.shift();
    return {
      running,
      queued,
      paused,
      terminal,
      total: tasks.length,
      peakConcurrency: this.peakConcurrency,
      estimatedMemoryBytes,
    };
  }

  /** 获取任务已运行毫秒（若在运行）。 */
  runtimeMs(taskId: string, now: number = Date.now()): number | null {
    const start = this.startTimeByTask.get(taskId);
    if (start === undefined) return null;
    return now - start;
  }

  /** 历史采样。 */
  samples(): ResourceSample[] {
    return [...this.history];
  }

  /** 按状态分桶统计。 */
  statusBreakdown(tasks: Task[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of tasks) {
      out[t.status] = (out[t.status] ?? 0) + 1;
    }
    return out;
  }

  /** 重置峰值（便于分段统计）。 */
  resetPeak(): void {
    this.peakConcurrency = 0;
  }

  get peak(): number {
    return this.peakConcurrency;
  }

  clear(): void {
    this.history = [];
    this.peakConcurrency = 0;
    this.startTimeByTask.clear();
    this.sizeByTask.clear();
  }

  /** 估算单任务占用字节（基于 JSON 长度，粗略）。 */
  private estimateTaskSize(task: Task): number {
    const cached = this.sizeByTask.get(task.id);
    if (cached !== undefined) return cached;
    let size: number;
    try {
      size = JSON.stringify(task).length * 2; // UTF-16 近似
    } catch {
      size = 256;
    }
    this.sizeByTask.set(task.id, size);
    return size;
  }
}

/** 全局状态汇总（纯函数，便于断言）。 */
export function summarizeStatus(
  tasks: Task[],
): Record<TaskStatus, number> {
  const out = {} as Record<TaskStatus, number>;
  const all: TaskStatus[] = [
    'pending',
    'queued',
    'running',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'timeout',
  ];
  for (const s of all) out[s] = 0;
  for (const t of tasks) out[t.status]++;
  return out;
}
