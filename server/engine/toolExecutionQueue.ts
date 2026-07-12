/**
 * Tool Execution Queue — 工具执行队列与速率限制
 *
 * 防止工具调用过于频繁：
 * 1. 全局并发限制（最多同时执行 N 个工具）
 * 2. 单工具速率限制（防止同一个工具被频繁调用）
 * 3. MCP Server 级别限制（防止单个 MCP Server 过载）
 * 4. 优先级队列（重要工具优先执行）
 * 5. 队列超时（等待过久的任务自动取消）
 *
 * v11.1: 新增工具执行队列与速率限制
 */

import { logger } from '../logger.js';
// P1-3: 使用统一错误类型类
import { QueueTimeoutError, QueueCancelledError } from '../errors/toolErrors.js';

// ===================== 类型定义 =====================

export interface QueuedToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  priority: 'high' | 'normal' | 'low';
  sessionId?: string;
  enqueuedAt: number;
  signal?: AbortSignal;
}

export interface QueueConfig {
  maxConcurrent: number;
  perToolRateLimit?: {
    maxCallsPerMinute: number;
  };
  mcpServerRateLimit?: {
    maxCallsPerMinute: number;
  };
  queueTimeoutMs: number;
}

export interface QueueStats {
  queueLength: number;
  activeCount: number;
  completedCount: number;
  timeoutCount: number;
  avgWaitTimeMs: number;
}

type QueuedTask = QueuedToolCall & {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  executor: (signal: AbortSignal) => Promise<string>;
  /** P2-2: 队列等待超时句柄，执行开始后需清理 */
  queueTimeoutHandle?: ReturnType<typeof setTimeout>;
  /** P0: 信号取消监听器，任务完成后需移除以防 listener 泄漏 */
  abortListener?: () => void;
};

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 5,
  perToolRateLimit: {
    maxCallsPerMinute: 60,
  },
  mcpServerRateLimit: {
    maxCallsPerMinute: 30,
  },
  queueTimeoutMs: 120000, // 2 分钟
};

// ===================== 状态 =====================

class ToolExecutionQueueManager {
  private config: QueueConfig = DEFAULT_CONFIG;
  
  /** 等待队列（按优先级分组） */
  private queue: QueuedTask[] = [];
  
  /** 正在执行的任务 */
  private active: Set<string> = new Set();
  
  /** 工具调用计数（用于速率限制） */
  private toolCallCounts: Map<string, number[]> = new Map();
  
  /** MCP Server 调用计数 */
  private mcpServerCallCounts: Map<string, number[]> = new Map();
  
  /** 统计 */
  private completedCount = 0;
  private timeoutCount = 0;
  private totalWaitTime = 0;

  /** P2: 速率限制重试定时器句柄 — 在 clear() 时清理 */
  private retryTimerHandle?: ReturnType<typeof setTimeout>;

  /**
   * 更新配置（P0-1: 增加输入校验）
   */
  updateConfig(config: Partial<QueueConfig>): void {
    const sanitized: Partial<QueueConfig> = {};

    if (config.maxConcurrent !== undefined) {
      // maxConcurrent 必须 >= 1，否则任务永远排队（死锁）
      if (typeof config.maxConcurrent === 'number' &&
          Number.isFinite(config.maxConcurrent) &&
          config.maxConcurrent >= 1) {
        sanitized.maxConcurrent = Math.floor(config.maxConcurrent);
      } else {
        logger.warn(`[ToolQueue] Invalid maxConcurrent: must be a finite integer >= 1, got=${config.maxConcurrent}`);
      }
    }
    if (config.queueTimeoutMs !== undefined) {
      if (typeof config.queueTimeoutMs === 'number' &&
          Number.isFinite(config.queueTimeoutMs) &&
          config.queueTimeoutMs >= 1000) {
        sanitized.queueTimeoutMs = config.queueTimeoutMs;
      } else {
        logger.warn(`[ToolQueue] Invalid queueTimeoutMs: must be a finite number >= 1000, got=${config.queueTimeoutMs}`);
      }
    }
    if (config.perToolRateLimit !== undefined && typeof config.perToolRateLimit === 'object') {
      const rl = config.perToolRateLimit;
      if (typeof rl.maxCallsPerMinute === 'number' &&
          Number.isFinite(rl.maxCallsPerMinute) &&
          rl.maxCallsPerMinute >= 1) {
        sanitized.perToolRateLimit = { maxCallsPerMinute: Math.floor(rl.maxCallsPerMinute) };
      } else {
        logger.warn(`[ToolQueue] Invalid perToolRateLimit.maxCallsPerMinute: must be a finite integer >= 1, got=${rl.maxCallsPerMinute}`);
      }
    }
    if (config.mcpServerRateLimit !== undefined && typeof config.mcpServerRateLimit === 'object') {
      const rl = config.mcpServerRateLimit;
      if (typeof rl.maxCallsPerMinute === 'number' &&
          Number.isFinite(rl.maxCallsPerMinute) &&
          rl.maxCallsPerMinute >= 1) {
        sanitized.mcpServerRateLimit = { maxCallsPerMinute: Math.floor(rl.maxCallsPerMinute) };
      } else {
        logger.warn(`[ToolQueue] Invalid mcpServerRateLimit.maxCallsPerMinute: must be a finite integer >= 1, got=${rl.maxCallsPerMinute}`);
      }
    }

    this.config = { ...this.config, ...sanitized };
    logger.debug(`[ToolQueue] Config updated: maxConcurrent=${this.config.maxConcurrent}`);
    // 配置变更后尝试处理队列中的任务（如 maxConcurrent 增加后应立即启动等待中的任务）
    this.processNext();
  }

  /**
   * 检查是否可以执行（速率限制）
   */
  private canExecute(toolName: string): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // 检查全局并发限制
    if (this.active.size >= this.config.maxConcurrent) {
      return false;
    }

    // 检查单工具速率限制
    if (this.config.perToolRateLimit) {
      const calls = this.toolCallCounts.get(toolName) || [];
      const recentCalls = calls.filter(t => t > oneMinuteAgo);
      if (recentCalls.length >= this.config.perToolRateLimit.maxCallsPerMinute) {
        return false;
      }
    }

    // 检查 MCP Server 速率限制
    if (toolName.startsWith('mcp__') && this.config.mcpServerRateLimit) {
      const serverPrefix = toolName.split('__')[1];
      if (serverPrefix) {
        const calls = this.mcpServerCallCounts.get(serverPrefix) || [];
        const recentCalls = calls.filter(t => t > oneMinuteAgo);
        if (recentCalls.length >= this.config.mcpServerRateLimit.maxCallsPerMinute) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 记录调用（用于速率限制计数）
   */
  private recordCall(toolName: string): void {
    const now = Date.now();

    // 记录工具调用
    let toolCalls = this.toolCallCounts.get(toolName) || [];
    toolCalls.push(now);
    // 只保留最近 2 分钟的记录
    toolCalls = toolCalls.filter(t => t > now - 120000);
    // P2: 清理空数组，防止 Map 键无限增长（动态工具名场景）
    if (toolCalls.length > 0) {
      this.toolCallCounts.set(toolName, toolCalls);
    } else {
      this.toolCallCounts.delete(toolName);
    }

    // 记录 MCP Server 调用
    if (toolName.startsWith('mcp__')) {
      const serverPrefix = toolName.split('__')[1];
      if (serverPrefix) {
        let serverCalls = this.mcpServerCallCounts.get(serverPrefix) || [];
        serverCalls.push(now);
        serverCalls = serverCalls.filter(t => t > now - 120000);
        // P2: 清理空数组
        if (serverCalls.length > 0) {
          this.mcpServerCallCounts.set(serverPrefix, serverCalls);
        } else {
          this.mcpServerCallCounts.delete(serverPrefix);
        }
      }
    }
  }

  /**
   * 入队工具调用
   */
  async enqueue<T extends QueuedToolCall>(
    call: T,
    executor: (signal: AbortSignal) => Promise<string>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const task: QueuedTask = {
        ...call,
        resolve: resolve as (value: string) => void,
        reject,
        executor,
      };

      // 检查队列超时
      const queueTimeout = setTimeout(() => {
        const index = this.queue.findIndex(t => t.id === task.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.timeoutCount++;
          // P1-3: 使用统一错误类（支持 instanceof）
          reject(new QueueTimeoutError(call.toolName, this.config.queueTimeoutMs));
        }
      }, this.config.queueTimeoutMs);
      task.queueTimeoutHandle = queueTimeout;

      // 监听取消信号（P2-2: 运行中任务也需取消）
      // P0: 存储 listener 以便在任务完成后移除，防止 listener 泄漏
      const abortListener = () => {
        // 先检查队列中
        const index = this.queue.findIndex(t => t.id === task.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          clearTimeout(queueTimeout);
          // P1-3: 使用统一错误类
          reject(new QueueCancelledError(call.toolName, 'cancelled'));
          return;
        }
        // P2-2: 若已出队正在执行，abort signal 会传递给 executor
        // executor 应在内部检查 signal.aborted 并抛出 AbortError
        // reject 由 executeTask 的 catch 块处理
      };
      call.signal?.addEventListener('abort', abortListener);
      task.abortListener = abortListener;

      // P2-2: 队列积压告警
      if (this.queue.length >= 10) {
        logger.warn(`[ToolQueue] Queue backlog alert: ${this.queue.length} tasks waiting (active=${this.active.size})`);
      }

      // 按优先级插入队列
      this.insertByPriority(task);
      logger.debug(`[ToolQueue] Enqueued: ${call.toolName} (queue=${this.queue.length}, active=${this.active.size})`);

      // 尝试执行下一个
      this.processNext();
    });
  }

  /**
   * 按优先级插入队列
   */
  private insertByPriority(task: QueuedTask): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const taskPriority = priorityOrder[task.priority];

    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (priorityOrder[this.queue[i].priority] > taskPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, task);
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNext(): void {
    // 找到可以执行的任务
    const nextTaskIndex = this.queue.findIndex(t =>
      !t.signal?.aborted && this.canExecute(t.toolName)
    );

    if (nextTaskIndex === -1) {
      // P2-2: 速率限制重试 — 若有任务因速率限制无法执行，安排定时重试
      // P2: 存储 timer handle 以便在 clear() 时清理
      // P2-2 fix: 覆盖前先清理前一个 retryTimerHandle，防止定时器泄漏 + 冗余调度
      if (this.queue.length > 0 && this.active.size < this.config.maxConcurrent) {
        const blockedTask = this.queue.find(t => !t.signal?.aborted);
        if (blockedTask) {
          const retryDelay = this.getNextRetryDelayMs(blockedTask.toolName);
          if (retryDelay > 0) {
            if (this.retryTimerHandle) {
              clearTimeout(this.retryTimerHandle);
            }
            this.retryTimerHandle = setTimeout(() => {
              this.retryTimerHandle = undefined;
              this.processNext();
            }, retryDelay);
          }
        }
      }
      return;
    }

    const task = this.queue[nextTaskIndex];
    this.queue.splice(nextTaskIndex, 1);

    this.executeTask(task);
  }

  /**
   * P2-2: 计算速率限制的下次重试延迟
   */
  private getNextRetryDelayMs(toolName: string): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    if (this.config.perToolRateLimit) {
      const calls = (this.toolCallCounts.get(toolName) || []).filter(t => t > oneMinuteAgo);
      if (calls.length >= this.config.perToolRateLimit.maxCallsPerMinute) {
        // 下一个窗口开始时间 = 最早记录时间 + 60s
        return Math.max(1000, calls[0] + 60000 - now);
      }
    }
    return 0;
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: QueuedTask): Promise<void> {
    // P2-2: 清理队列等待超时句柄（任务已开始执行，不再需要队列超时）
    if (task.queueTimeoutHandle) {
      clearTimeout(task.queueTimeoutHandle);
      task.queueTimeoutHandle = undefined;
    }

    // P2-2: 执行前再次检查信号是否已取消
    if (task.signal?.aborted) {
      // P1-3: 使用统一错误类
      task.reject(new QueueCancelledError(task.toolName, 'cancelled before start'));
      this.processNext();
      return;
    }

    this.active.add(task.id);
    this.recordCall(task.toolName);
    const waitTime = Date.now() - task.enqueuedAt;
    this.totalWaitTime += waitTime;

    try {
      logger.debug(`[ToolQueue] Executing: ${task.toolName} (wait=${waitTime}ms)`);
      const result = await task.executor(task.signal || new AbortController().signal);
      this.completedCount++;
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.active.delete(task.id);
      // P0: 移除 abort listener，防止 signal 上 listener 堆积
      if (task.abortListener && task.signal) {
        task.signal.removeEventListener('abort', task.abortListener);
        task.abortListener = undefined;
      }
      // 处理下一个
      this.processNext();
    }
  }

  /**
   * 获取队列统计
   */
  getStats(): QueueStats {
    return {
      queueLength: this.queue.length,
      activeCount: this.active.size,
      completedCount: this.completedCount,
      timeoutCount: this.timeoutCount,
      avgWaitTimeMs: this.queue.length > 0 ? Math.round(this.totalWaitTime / this.completedCount) : 0,
    };
  }

  /**
   * 获取队列状态详情
   */
  getQueueStatus(): { queued: string[]; active: string[] } {
    return {
      queued: this.queue.map(t => t.toolName),
      active: Array.from(this.active),
    };
  }

  /**
   * 清空队列
   */
  clear(): void {
    // P2: 清理速率限制重试定时器
    if (this.retryTimerHandle) {
      clearTimeout(this.retryTimerHandle);
      this.retryTimerHandle = undefined;
    }
    // 拒绝所有等待中的任务，并移除 abort listeners
    for (const task of this.queue) {
      // P0: 移除 abort listener 防止泄漏
      if (task.abortListener && task.signal) {
        task.signal.removeEventListener('abort', task.abortListener);
        task.abortListener = undefined;
      }
      if (task.queueTimeoutHandle) {
        clearTimeout(task.queueTimeoutHandle);
        task.queueTimeoutHandle = undefined;
      }
      task.reject(new QueueCancelledError(task.toolName, 'queue cleared'));
    }
    this.queue = [];
    this.toolCallCounts.clear();
    this.mcpServerCallCounts.clear();
    logger.debug('[ToolQueue] Queue cleared');
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.completedCount = 0;
    this.timeoutCount = 0;
    this.totalWaitTime = 0;
  }
}

// ===================== 导出 =====================

export const toolExecutionQueue = new ToolExecutionQueueManager();

/**
 * 包装器：通过队列执行工具
 */
export async function executeViaQueue<T>(
  toolName: string,
  args: Record<string, unknown>,
  executor: (signal: AbortSignal) => Promise<T>,
  options: {
    priority?: 'high' | 'normal' | 'low';
    sessionId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const call: QueuedToolCall = {
    id: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    toolName,
    args,
    priority: options.priority || 'normal',
    sessionId: options.sessionId,
    enqueuedAt: Date.now(),
    signal: options.signal,
  };

  const result = await toolExecutionQueue.enqueue(call, executor as (signal: AbortSignal) => Promise<string>);
  return result as T;
}