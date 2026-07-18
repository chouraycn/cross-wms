/**
 * Subagent Scheduler — 调度器
 *
 * 基于优先级 + FIFO 策略调度 subagent 任务执行，内部使用
 * `executionLanes` 的 `subagent` 车道做并发限流。
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';
import { executionLanes } from '../agents/executionLanes.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 任务状态 */
export type SubagentTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** 单个调度任务 */
export interface SubagentTask {
  /** 任务 ID（可选，不传则自动生成） */
  id?: string;
  /** 任务名称（用于日志/调试） */
  name: string;
  /** 任务载荷 */
  payload?: unknown;
  /** 优先级：数字越小优先级越高，默认 100 */
  priority?: number;
  /** 任务执行器 */
  execute: (task: SubagentTask) => Promise<unknown>;
  /** 失败时是否允许跳过（默认 false） */
  optional?: boolean;
  /** 任务元数据 */
  metadata?: Record<string, unknown>;
}

/** 调度结果 */
export interface SubagentScheduledResult {
  taskId: string;
  status: SubagentTaskStatus;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

/** 调度选项 */
export interface ScheduleOptions {
  /** 任务超时（毫秒） */
  timeoutMs?: number;
}

// ============================================================================
// 内部队列节点
// ============================================================================

interface QueueNode {
  task: SubagentTask;
  taskId: string;
  status: SubagentTaskStatus;
  result?: unknown;
  error?: string;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  resolve: (value: SubagentScheduledResult) => void;
  reject: (reason: Error) => void;
  cancelled: boolean;
}

// ============================================================================
// SubagentScheduler 类
// ============================================================================

/**
 * 调度器
 *
 * - 入队：按 priority 升序（数字越小优先级越高）+ FIFO 排序
 * - 执行：每个任务通过 `executionLanes.acquire('subagent')` 限流
 * - 暂停：暂停时不再触发新任务，pending 任务仍保留在队列中
 * - 取消：仅取消 pending 状态的任务
 */
export class SubagentScheduler {
  private readonly queue: QueueNode[] = [];
  private readonly results = new Map<string, SubagentScheduledResult>();
  private readonly nodes = new Map<string, QueueNode>();
  private paused = false;
  private running = false;
  private activeCount = 0;

  /**
   * 将任务加入队列并执行
   * @param task - 任务定义
   * @param options - 调度选项
   * @returns Promise，解析为该任务的最终结果
   */
  async schedule(
    task: SubagentTask,
    options: ScheduleOptions = {},
  ): Promise<SubagentScheduledResult> {
    const taskId = task.id ?? `sched_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const fullTask: SubagentTask = { ...task, id: taskId };

    return new Promise<SubagentScheduledResult>((resolve, reject) => {
      const node: QueueNode = {
        task: fullTask,
        taskId,
        status: 'pending',
        enqueuedAt: Date.now(),
        resolve,
        reject,
        cancelled: false,
      };
      this.nodes.set(taskId, node);
      this.results.set(taskId, {
        taskId,
        status: 'pending',
      });
      this.enqueue(node);
      // 推迟到下一个微任务再触发运行，
      // 这样同一同步块内多次 schedule() 调用能在 runNext 启动前全部入队
      queueMicrotask(() => {
        this.runNext(options).catch((err) => {
          logger.error('[SubagentScheduler] 运行循环异常:', err);
        });
      });
    });
  }

  /**
   * 取消任务
   *
   * - pending（队列中）：直接移除并标记 cancelled
   * - waiting/running（已出队）：标记 cancelled，由 executeNode 在适当时机退出
   * @param taskId - 任务 ID
   * @returns 是否成功取消
   */
  cancel(taskId: string): boolean {
    const node = this.nodes.get(taskId);
    if (!node) return false;
    if (node.status === 'completed' || node.status === 'failed' || node.status === 'cancelled') {
      return false;
    }

    node.cancelled = true;
    node.status = 'cancelled';
    node.completedAt = Date.now();
    // 任务若仍在队列中则直接出队
    this.removeFromQueue(node);

    const result: SubagentScheduledResult = {
      taskId,
      status: 'cancelled',
      completedAt: node.completedAt,
    };
    this.results.set(taskId, result);
    node.resolve(result);
    return true;
  }

  /** 暂停调度器（不再触发新任务） */
  pause(): void {
    this.paused = true;
  }

  /** 恢复调度器 */
  resume(): void {
    this.paused = false;
    this.runNext().catch((err) => {
      logger.error('[SubagentScheduler] 恢复后运行异常:', err);
    });
  }

  /**
   * 获取任务状态
   * @param taskId - 任务 ID
   * @returns 任务状态字符串
   */
  getStatus(taskId: string): SubagentTaskStatus {
    const node = this.nodes.get(taskId);
    if (!node) {
      // 任务不存在时返回 cancelled 兜底，避免外部报错
      return 'cancelled';
    }
    return node.status;
  }

  /** 获取当前 pending 队列长度 */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取当前活跃（已出队，等待 acquire 或正在执行）的任务数
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /** 获取所有结果快照 */
  getAllResults(): SubagentScheduledResult[] {
    return Array.from(this.results.values());
  }

  /** 清空所有任务与结果（用于测试） */
  reset(): void {
    for (const node of this.queue) {
      if (node.status === 'pending') {
        node.cancelled = true;
        node.status = 'cancelled';
        node.resolve({
          taskId: node.taskId,
          status: 'cancelled',
        });
      }
    }
    this.queue.length = 0;
    this.results.clear();
    this.nodes.clear();
    this.paused = false;
    this.running = false;
    this.activeCount = 0;
  }

  // ============ 内部方法 ============

  /**
   * 将节点加入 pending 队列，按优先级 + FIFO 排序
   */
  private enqueue(node: QueueNode): void {
    this.queue.push(node);
    this.queue.sort((a, b) => {
      const pa = a.task.priority ?? 100;
      const pb = b.task.priority ?? 100;
      if (pa !== pb) return pa - pb;
      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  /**
   * 从队列中移除节点
   */
  private removeFromQueue(node: QueueNode): void {
    const index = this.queue.indexOf(node);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * 触发队列执行
   *
   * 任务一旦出队（被 runNext 取出）就不再计入 getQueueLength；
   * 若想观察正在运行的并发任务数，请使用 getActiveCount。
   */
  private async runNext(options: ScheduleOptions = {}): Promise<void> {
    if (this.paused) return;
    if (this.running) return;
    this.running = true;
    try {
      while (!this.paused) {
        // 跳过已被取消的队首
        while (this.queue.length > 0 && this.queue[0]?.cancelled) {
          this.queue.shift();
        }
        if (this.queue.length === 0) break;
        // 出队并启动
        const node = this.queue.shift()!;
        this.activeCount++;
        void this.executeNode(node, options);
        // 让出微任务，避免同步无限循环
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * 执行单个任务
   */
  private async executeNode(
    node: QueueNode,
    options: ScheduleOptions,
  ): Promise<void> {
    if (node.cancelled) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      return;
    }
    let release: (() => void) | null = null;
    try {
      release = await executionLanes.acquire('subagent');
    } catch (err) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.failNode(node, err instanceof Error ? err : new Error(String(err)));
      this.runNext(options).catch((e) => {
        logger.error('[SubagentScheduler] 续跑异常:', e);
      });
      return;
    }

    if (node.cancelled) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      try {
        executionLanes.release('subagent', release);
      } catch {
        // 静默忽略
      }
      return;
    }

    node.status = 'running';
    node.startedAt = Date.now();
    this.results.set(node.taskId, {
      taskId: node.taskId,
      status: 'running',
      startedAt: node.startedAt,
    });

    try {
      const result = options.timeoutMs
        ? await this.executeWithTimeout(node, options.timeoutMs)
        : await node.task.execute(node.task);
      this.completeNode(node, result);
    } catch (err) {
      this.failNode(node, err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (release) {
        try {
          executionLanes.release('subagent', release);
        } catch {
          // 静默忽略 release 错误
        }
      }
      this.activeCount = Math.max(0, this.activeCount - 1);
      // 触发后续任务
      this.runNext(options).catch((e) => {
        logger.error('[SubagentScheduler] 续跑异常:', e);
      });
    }
  }

  /**
   * 带超时执行任务
   */
  private executeWithTimeout(
    node: QueueNode,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Subagent task ${node.taskId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      node.task
        .execute(node.task)
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /** 标记任务完成 */
  private completeNode(node: QueueNode, result: unknown): void {
    if (node.cancelled) return;
    node.status = 'completed';
    node.result = result;
    node.completedAt = Date.now();
    const final: SubagentScheduledResult = {
      taskId: node.taskId,
      status: 'completed',
      result,
      startedAt: node.startedAt,
      completedAt: node.completedAt,
      durationMs:
        node.startedAt !== undefined
          ? node.completedAt - node.startedAt
          : undefined,
    };
    this.results.set(node.taskId, final);
    node.resolve(final);
  }

  /** 标记任务失败 */
  private failNode(node: QueueNode, err: Error): void {
    if (node.cancelled) return;
    node.status = 'failed';
    node.error = err.message;
    node.completedAt = Date.now();
    const final: SubagentScheduledResult = {
      taskId: node.taskId,
      status: 'failed',
      error: err.message,
      startedAt: node.startedAt,
      completedAt: node.completedAt,
      durationMs:
        node.startedAt !== undefined
          ? node.completedAt - node.startedAt
          : undefined,
    };
    this.results.set(node.taskId, final);
    node.reject(err);
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let globalScheduler: SubagentScheduler | null = null;

/** 获取全局调度器单例 */
export function getSubagentScheduler(): SubagentScheduler {
  if (!globalScheduler) {
    globalScheduler = new SubagentScheduler();
  }
  return globalScheduler;
}

/** 重置全局调度器（用于测试） */
export function resetSubagentSchedulerForTests(): void {
  if (globalScheduler) {
    globalScheduler.reset();
  }
  globalScheduler = null;
}
