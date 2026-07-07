/**
 * AttemptRunner — 统一 attempt 调度器
 *
 * 参照 openclaw 的多 attempt runner 并发架构设计，
 * 统一 cdf-know 现有的 MessageQueue / SubagentRunner /
 * executionLanes / BackgroundTaskManager 等并发能力，
 * 为未来的 agentic 模式和多任务并发提供统一抽象。
 *
 * 核心概念：
 * - Attempt: 一次可取消的执行单元（类似于 openclaw 的 attempt）
 * - Lane: 执行车道，同车道内串行，不同车道间并发
 * - SessionAffinity: 同会话的 attempt 默认串行，可显式开启并发
 *
 * 分层架构：
 *   ┌─────────────────────────────────────────┐
 *   │           API Layer (chatService)       │
 *   ├─────────────────────────────────────────┤
 *   │         AttemptRunner (统一调度)         │
 *   ├──────┬───────┬──────────┬──────────────┤
 *   │ MsgQ │ SubAg │ ExecLane │ BackgroundTask│
 *   └──────┴───────┴──────────┴──────────────┘
 *
 * v1.0: 基础骨架 + 全局并发限制 + attempt 状态追踪 + 取消传播
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export type AttemptStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type AttemptPriority = 'low' | 'normal' | 'high' | 'critical';

export type AttemptLane =
  | 'foreground'
  | 'background'
  | 'subagent'
  | 'compaction'
  | 'utility';

export interface AttemptContext {
  attemptId: string;
  sessionId: string | null;
  lane: AttemptLane;
  priority: AttemptPriority;
  signal: AbortSignal;
  createdAt: number;
  startedAt?: number;
  /** 父 attempt ID（嵌套调用时） */
  parentAttemptId?: string;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

export interface AttemptResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: Error;
  status: AttemptStatus;
  durationMs: number;
  attemptId: string;
}

export interface AttemptOptions {
  sessionId?: string | null;
  lane?: AttemptLane;
  priority?: AttemptPriority;
  timeoutMs?: number;
  /** 是否允许同会话并发（默认 false，同会话串行） */
  allowConcurrentPerSession?: boolean;
  /** 父 attempt ID */
  parentAttemptId?: string;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
  /** 进度回调 */
  onProgress?: (progress: number, message?: string) => void;
}

interface AttemptEntry<T = unknown> {
  id: string;
  sessionId: string | null;
  lane: AttemptLane;
  priority: AttemptPriority;
  status: AttemptStatus;
  fn: (ctx: AttemptContext) => Promise<T>;
  controller: AbortController;
  timeoutMs: number;
  allowConcurrentPerSession: boolean;
  parentAttemptId?: string;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: number, message?: string) => void;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: AttemptResult<T>;
  resolve?: (result: AttemptResult<T>) => void;
  reject?: (error: Error) => void;
}

// ===================== 默认配置 =====================

const DEFAULT_CONFIG = {
  maxConcurrentTotal: 8,
  maxConcurrentPerLane: {
    foreground: 2,
    background: 4,
    subagent: 3,
    compaction: 1,
    utility: 2,
  } as Record<AttemptLane, number>,
  maxConcurrentPerSession: 1,
  defaultTimeoutMs: 30 * 60 * 1000,
  queueMaxLength: 100,
  idleCleanupIntervalMs: 60_000,
  completedRetentionMs: 5 * 60 * 1000,
};

// ===================== AttemptRunner =====================

export class AttemptRunner extends EventEmitter {
  private config: typeof DEFAULT_CONFIG;
  private attempts = new Map<string, AttemptEntry>();
  private queue: string[] = [];
  private activeCount = 0;
  private activeByLane = new Map<AttemptLane, number>();
  private activeBySession = new Map<string, number>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<typeof DEFAULT_CONFIG>) {
    super();
    this.setMaxListeners(100);
    this.config = { ...DEFAULT_CONFIG, ...config };
    for (const lane of Object.keys(this.config.maxConcurrentPerLane) as AttemptLane[]) {
      this.activeByLane.set(lane, 0);
    }
  }

  // ===================== 公开 API =====================

  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(
      () => this.cleanupCompleted(),
      this.config.idleCleanupIntervalMs,
    );
    logger.info('[AttemptRunner] 已启动，全局并发上限:', this.config.maxConcurrentTotal);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // 取消所有进行中的 attempt
    for (const entry of this.attempts.values()) {
      if (entry.status === 'running' || entry.status === 'queued' || entry.status === 'pending') {
        entry.controller.abort();
        entry.status = 'cancelled';
      }
    }
    logger.info('[AttemptRunner] 已停止');
  }

  /**
   * 提交一个 attempt 执行
   * @param fn 执行函数
   * @param options 选项
   * @returns Promise<AttemptResult<T>>
   */
  run<T>(
    fn: (ctx: AttemptContext) => Promise<T>,
    options: AttemptOptions = {},
  ): Promise<AttemptResult<T>> {
    return new Promise<AttemptResult<T>>((resolve, reject) => {
      const attemptId = randomUUID();
      const lane = options.lane || 'foreground';
      const priority = options.priority || 'normal';
      const sessionId = options.sessionId ?? null;
      const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs;

      if (this.attempts.size >= this.config.queueMaxLength) {
        reject(new Error('[AttemptRunner] 队列已满，请稍后重试'));
        return;
      }

      const controller = new AbortController();

      const entry: AttemptEntry<T> = {
        id: attemptId,
        sessionId,
        lane,
        priority,
        status: 'queued',
        fn,
        controller,
        timeoutMs,
        allowConcurrentPerSession: options.allowConcurrentPerSession ?? false,
        parentAttemptId: options.parentAttemptId,
        metadata: options.metadata,
        onProgress: options.onProgress,
        createdAt: Date.now(),
        resolve: resolve as (result: AttemptResult<unknown>) => void,
        reject,
      };

      this.attempts.set(attemptId, entry as AttemptEntry);
      this.enqueueAttempt(attemptId);
      this.emit('attempt:queued', { attemptId, sessionId, lane, priority });

      // 尝试立即调度
      this.trySchedule();
    });
  }

  /**
   * 取消指定 attempt
   */
  cancel(attemptId: string, reason?: string): boolean {
    const entry = this.attempts.get(attemptId);
    if (!entry) return false;
    if (entry.status === 'completed' || entry.status === 'failed' || entry.status === 'cancelled' || entry.status === 'timeout') {
      return false;
    }
    entry.controller.abort(reason || 'cancelled');
    if (entry.status === 'queued' || entry.status === 'pending') {
      // 队列中的直接标记为取消
      entry.status = 'cancelled';
      this.removeFromQueue(attemptId);
      const result: AttemptResult = {
        success: false,
        error: new Error(reason || 'Cancelled'),
        status: 'cancelled',
        durationMs: Date.now() - entry.createdAt,
        attemptId,
      };
      entry.resolve?.(result);
      this.emit('attempt:cancelled', { attemptId, reason });
    }
    // running 状态的等待执行函数响应 signal 中止
    return true;
  }

  /**
   * 取消会话的所有 attempt
   */
  cancelSession(sessionId: string): string[] {
    const cancelled: string[] = [];
    for (const entry of this.attempts.values()) {
      if (entry.sessionId === sessionId && this.cancel(entry.id)) {
        cancelled.push(entry.id);
      }
    }
    return cancelled;
  }

  /** 获取 attempt 状态 */
  getStatus(attemptId: string): AttemptStatus | null {
    return this.attempts.get(attemptId)?.status ?? null;
  }

  /** 获取统计信息 */
  getStats() {
    const byStatus = new Map<AttemptStatus, number>();
    for (const s of ['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout'] as AttemptStatus[]) {
      byStatus.set(s, 0);
    }
    for (const entry of this.attempts.values()) {
      byStatus.set(entry.status, (byStatus.get(entry.status) || 0) + 1);
    }
    return {
      total: this.attempts.size,
      active: this.activeCount,
      queued: this.queue.length,
      byStatus: Object.fromEntries(byStatus),
      byLane: Object.fromEntries(this.activeByLane),
    };
  }

  // ===================== 内部调度 =====================

  private enqueueAttempt(attemptId: string): void {
    // 按优先级插入队列
    const priorityOrder: Record<AttemptPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    const entry = this.attempts.get(attemptId);
    if (!entry) return;

    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.attempts.get(this.queue[i]);
      if (!existing) continue;
      if (priorityOrder[entry.priority] < priorityOrder[existing.priority]) {
        insertIdx = i;
        break;
      }
    }
    this.queue.splice(insertIdx, 0, attemptId);
  }

  private removeFromQueue(attemptId: string): void {
    const idx = this.queue.indexOf(attemptId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
    }
  }

  private trySchedule(): void {
    while (this.queue.length > 0) {
      const attemptId = this.queue[0];
      const entry = this.attempts.get(attemptId);
      if (!entry) {
        this.queue.shift();
        continue;
      }

      // 全局并发限制
      if (this.activeCount >= this.config.maxConcurrentTotal) break;

      // 车道并发限制
      const laneActive = this.activeByLane.get(entry.lane) || 0;
      const laneLimit = this.config.maxConcurrentPerLane[entry.lane];
      if (laneActive >= laneLimit) break;

      // 会话并发限制
      if (entry.sessionId && !entry.allowConcurrentPerSession) {
        const sessionActive = this.activeBySession.get(entry.sessionId) || 0;
        if (sessionActive >= this.config.maxConcurrentPerSession) break;
      }

      // 可以执行，出队
      this.queue.shift();
      this.executeAttempt(entry);
    }
  }

  private async executeAttempt(entry: AttemptEntry): Promise<void> {
    entry.status = 'running';
    entry.startedAt = Date.now();
    this.activeCount++;
    this.activeByLane.set(entry.lane, (this.activeByLane.get(entry.lane) || 0) + 1);
    if (entry.sessionId) {
      this.activeBySession.set(entry.sessionId, (this.activeBySession.get(entry.sessionId) || 0) + 1);
    }

    this.emit('attempt:started', {
      attemptId: entry.id,
      sessionId: entry.sessionId,
      lane: entry.lane,
    });

    const ctx: AttemptContext = {
      attemptId: entry.id,
      sessionId: entry.sessionId,
      lane: entry.lane,
      priority: entry.priority,
      signal: entry.controller.signal,
      createdAt: entry.createdAt,
      startedAt: entry.startedAt,
      parentAttemptId: entry.parentAttemptId,
      metadata: entry.metadata,
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      // 设置超时
      if (entry.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          entry.controller.abort('timeout');
        }, entry.timeoutMs);
      }

      const result = await entry.fn(ctx);

      if (entry.controller.signal.aborted) {
        // 被取消或超时
        const isTimeout = entry.controller.signal.reason === 'timeout';
        entry.status = isTimeout ? 'timeout' : 'cancelled';
        const attemptResult: AttemptResult = {
          success: false,
          error: new Error(isTimeout ? 'Timeout' : 'Cancelled'),
          status: entry.status,
          durationMs: Date.now() - (entry.startedAt || entry.createdAt),
          attemptId: entry.id,
        };
        entry.result = attemptResult;
        entry.resolve?.(attemptResult);
        this.emit(`attempt:${entry.status}`, { attemptId: entry.id });
      } else {
        entry.status = 'completed';
        entry.completedAt = Date.now();
        const attemptResult: AttemptResult = {
          success: true,
          result,
          status: 'completed',
          durationMs: entry.completedAt - (entry.startedAt || entry.createdAt),
          attemptId: entry.id,
        };
        entry.result = attemptResult;
        entry.resolve?.(attemptResult);
        this.emit('attempt:completed', { attemptId: entry.id, durationMs: attemptResult.durationMs });
      }
    } catch (error) {
      entry.status = 'failed';
      entry.completedAt = Date.now();
      const attemptResult: AttemptResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        status: 'failed',
        durationMs: Date.now() - (entry.startedAt || entry.createdAt),
        attemptId: entry.id,
      };
      entry.result = attemptResult;
      entry.resolve?.(attemptResult);
      this.emit('attempt:failed', { attemptId: entry.id, error: attemptResult.error });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.activeCount--;
      this.activeByLane.set(entry.lane, Math.max(0, (this.activeByLane.get(entry.lane) || 0) - 1));
      if (entry.sessionId) {
        const count = Math.max(0, (this.activeBySession.get(entry.sessionId) || 0) - 1);
        if (count === 0) {
          this.activeBySession.delete(entry.sessionId);
        } else {
          this.activeBySession.set(entry.sessionId, count);
        }
      }
      // 调度下一个
      setImmediate(() => this.trySchedule());
    }
  }

  private cleanupCompleted(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    for (const [id, entry] of this.attempts.entries()) {
      if (
        (entry.status === 'completed' || entry.status === 'failed' || entry.status === 'cancelled' || entry.status === 'timeout') &&
        entry.completedAt &&
        now - entry.completedAt > this.config.completedRetentionMs
      ) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.attempts.delete(id);
    }
    if (toDelete.length > 0) {
      logger.debug(`[AttemptRunner] 清理了 ${toDelete.length} 个已完成的 attempt`);
    }
  }
}

// ===================== 单例 =====================

let globalAttemptRunner: AttemptRunner | null = null;

export function getAttemptRunner(): AttemptRunner {
  if (!globalAttemptRunner) {
    globalAttemptRunner = new AttemptRunner();
  }
  return globalAttemptRunner;
}
