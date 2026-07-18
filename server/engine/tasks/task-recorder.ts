/**
 * tasks/task-recorder.ts — 任务记录器
 *
 * 记录任务终态与关键事件，供审计/回放/统计。
 * 内存实现，支持按 taskId/类型查询与序列化导出。
 */
import { nowIso } from './types.js';
import type { Task, TaskEvent, TaskEventType } from './types.js';

export interface RecordedEntry {
  id: number;
  taskId: string;
  kind: 'event' | 'final';
  type: TaskEventType | 'final';
  timestamp: string;
  data?: unknown;
}

export class TaskRecorder {
  private entries: RecordedEntry[] = [];
  private seq = 0;
  private maxEntries: number;

  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
  }

  /** 记录事件。 */
  recordEvent(event: TaskEvent): void {
    this.push({
      taskId: event.taskId,
      kind: 'event',
      type: event.type,
      timestamp: event.timestamp,
      data: event.data,
    });
  }

  /** 记录任务终态快照。 */
  recordFinal(task: Task): void {
    this.push({
      taskId: task.id,
      kind: 'final',
      type: 'final',
      timestamp: nowIso(),
      data: {
        status: task.status,
        result: task.result,
        error: task.error,
        retryCount: task.retryCount,
        durationMs: task.startedAt && task.completedAt
          ? Date.parse(task.completedAt) - Date.parse(task.startedAt)
          : null,
      },
    });
  }

  /** 按任务查询。 */
  forTask(taskId: string): RecordedEntry[] {
    return this.entries.filter(e => e.taskId === taskId);
  }

  /** 按类型查询。 */
  byType(type: TaskEventType | 'final'): RecordedEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  /** 最近 n 条。 */
  recent(n: number): RecordedEntry[] {
    return this.entries.slice(-n);
  }

  get size(): number {
    return this.entries.length;
  }

  /** 序列化为 JSON 字符串（便于落盘/传输）。 */
  serialize(): string {
    return JSON.stringify(this.entries);
  }

  /** 从 JSON 恢复。 */
  static deserialize(json: string): TaskRecorder {
    const r = new TaskRecorder();
    const arr = JSON.parse(json) as RecordedEntry[];
    r.entries = arr;
    r.seq = arr.reduce((m, e) => Math.max(m, e.id), 0);
    return r;
  }

  clear(): void {
    this.entries = [];
    this.seq = 0;
  }

  private push(entry: Omit<RecordedEntry, 'id'>): void {
    this.seq += 1;
    this.entries.push({ id: this.seq, ...entry });
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }
}
