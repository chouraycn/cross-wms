/**
 * Skill Execution Lanes — Skill 并发控制与执行通道
 *
 * 多通道并发控制系统，限制不同类型 Skill 的并发执行数：
 * - cron: 定时任务通道（5并发）
 * - cron-nested: 嵌套定时任务（1并发）
 * - subagent: 子 Agent 通道（3并发）
 * - nested: 嵌套调用（2并发）
 * - default: 默认通道（无限制）
 *
 * 作用：
 * 1. 防止某类 Skill 占用过多资源
 * 2. 控制嵌套调用深度，防止无限递归
 * 3. 提供执行队列，按顺序处理请求
 */

import { logger } from '../logger.js';
import type {
  SkillResult,
  SkillContext,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 执行通道类型 */
export type ExecutionLaneType =
  | 'cron'         // 定时任务
  | 'cron-nested'  // 嵌套定时任务
  | 'subagent'     // 子 Agent
  | 'nested'       // 嵌套调用
  | 'default';     // 默认通道

/** 通道配置 */
export interface LaneConfig {
  /** 最大并发数 */
  maxConcurrency: number;
  /** 最大队列大小（0 表示无限制） */
  maxQueueSize: number;
  /** 执行超时（毫秒，0 表示无超时） */
  timeoutMs: number;
}

/** 执行任务 */
interface ExecutionTask {
  /** 任务 ID */
  id: string;
  /** Skill ID */
  skillId: string;
  /** 执行函数 */
  executor: () => Promise<SkillResult>;
  /** 执行上下文 */
  context: SkillContext;
  /** resolve 函数 */
  resolve: (result: SkillResult) => void;
  /** reject 函数 */
  reject: (error: Error) => void;
  /** 入队时间 */
  enqueuedAt: number;
}

/** 通道状态 */
export interface LaneStatus {
  /** 当前执行中的任务数 */
  running: number;
  /** 队列中等待的任务数 */
  queued: number;
  /** 已完成的任务数 */
  completed: number;
  /** 失败的任务数 */
  failed: number;
  /** 最大并发数 */
  maxConcurrency: number;
}

// ===================== 常量 =====================

/** 默认通道配置 */
const DEFAULT_LANE_CONFIGS: Record<ExecutionLaneType, LaneConfig> = {
  'cron': { maxConcurrency: 5, maxQueueSize: 50, timeoutMs: 300_000 },
  'cron-nested': { maxConcurrency: 1, maxQueueSize: 20, timeoutMs: 120_000 },
  'subagent': { maxConcurrency: 3, maxQueueSize: 30, timeoutMs: 600_000 },
  'nested': { maxConcurrency: 2, maxQueueSize: 20, timeoutMs: 120_000 },
  'default': { maxConcurrency: 0, maxQueueSize: 0, timeoutMs: 0 }, // 0 = 无限制
};

// ===================== SkillExecutionLanes 类 =====================

/**
 * Skill 执行通道管理器
 */
export class SkillExecutionLanes {
  /** 通道配置 */
  private configs: Record<ExecutionLaneType, LaneConfig>;

  /** 各通道运行中的任务 */
  private runningTasks = new Map<ExecutionLaneType, Set<string>>();

  /** 各通道等待队列 */
  private queues = new Map<ExecutionLaneType, ExecutionTask[]>();

  /** 统计信息 */
  private stats = new Map<ExecutionLaneType, { completed: number; failed: number }>();

  constructor(customConfigs?: Partial<Record<ExecutionLaneType, LaneConfig>>) {
    this.configs = { ...DEFAULT_LANE_CONFIGS };

    if (customConfigs) {
      for (const [lane, config] of Object.entries(customConfigs)) {
        if (config) {
          this.configs[lane as ExecutionLaneType] = {
            ...this.configs[lane as ExecutionLaneType],
            ...config,
          };
        }
      }
    }

    // 初始化数据结构
    for (const lane of Object.keys(DEFAULT_LANE_CONFIGS) as ExecutionLaneType[]) {
      this.runningTasks.set(lane, new Set());
      this.queues.set(lane, []);
      this.stats.set(lane, { completed: 0, failed: 0 });
    }
  }

  // ===================== 1. 任务提交 =====================

  /**
   * 提交任务到执行通道
   *
   * 如果通道有空闲并发槽位，立即执行；否则加入队列等待。
   *
   * @param lane - 通道类型
   * @param skillId - Skill ID
   * @param executor - 执行函数
   * @param context - 执行上下文
   * @returns 执行结果 Promise
   */
  submit(
    lane: ExecutionLaneType,
    skillId: string,
    executor: () => Promise<SkillResult>,
    context: SkillContext,
  ): Promise<SkillResult> {
    const config = this.configs[lane];
    const running = this.runningTasks.get(lane)!;
    const queue = this.queues.get(lane)!;

    // 默认通道（无限制）直接执行
    if (config.maxConcurrency === 0) {
      return this.executeTask(lane, skillId, executor, context);
    }

    // 检查是否可以立即执行
    if (running.size < config.maxConcurrency) {
      return this.executeTask(lane, skillId, executor, context);
    }

    // 检查队列是否已满
    if (config.maxQueueSize > 0 && queue.length >= config.maxQueueSize) {
      return Promise.resolve({
        success: false,
        error: `执行通道 '${lane}' 队列已满（${queue.length}/${config.maxQueueSize}），请稍后重试`,
      });
    }

    // 加入队列
    return new Promise<SkillResult>((resolve, reject) => {
      const task: ExecutionTask = {
        id: this.generateTaskId(),
        skillId,
        executor,
        context,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      queue.push(task);
      logger.debug(`[ExecutionLanes] Task queued: ${skillId} (lane: ${lane}, position: ${queue.length})`);
    });
  }

  // ===================== 2. 任务执行 =====================

  /**
   * 执行任务
   */
  private async executeTask(
    lane: ExecutionLaneType,
    skillId: string,
    executor: () => Promise<SkillResult>,
    context: SkillContext,
  ): Promise<SkillResult> {
    const taskId = this.generateTaskId();
    const running = this.runningTasks.get(lane)!;
    const stats = this.stats.get(lane)!;

    running.add(taskId);
    logger.debug(`[ExecutionLanes] Task started: ${skillId} (lane: ${lane}, running: ${running.size})`);

    const config = this.configs[lane];
    const startTime = Date.now();

    try {
      let result: SkillResult;

      if (config.timeoutMs > 0) {
        // 带超时执行
        result = await this.withTimeout(executor(), config.timeoutMs, skillId);
      } else {
        result = await executor();
      }

      if (result.success) {
        stats.completed++;
      } else {
        stats.failed++;
      }
      return result;
    } catch (e) {
      stats.failed++;
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        error: errorMsg,
        metadata: { durationMs: Date.now() - startTime },
      };
    } finally {
      running.delete(taskId);
      logger.debug(`[ExecutionLanes] Task finished: ${skillId} (lane: ${lane}, running: ${running.size})`);

      // 尝试执行队列中的下一个任务
      this.processNextTask(lane);
    }
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNextTask(lane: ExecutionLaneType): void {
    const running = this.runningTasks.get(lane)!;
    const queue = this.queues.get(lane)!;
    const config = this.configs[lane];

    if (queue.length === 0) return;
    if (config.maxConcurrency > 0 && running.size >= config.maxConcurrency) return;

    const task = queue.shift();
    if (!task) return;

    logger.debug(`[ExecutionLanes] Dequeuing task: ${task.skillId} (lane: ${lane}, waited: ${Date.now() - task.enqueuedAt}ms)`);

    // 异步执行，不阻塞
    this.executeTask(lane, task.skillId, task.executor, task.context)
      .then((result) => task.resolve(result))
      .catch((error) => task.reject(error));
  }

  /**
   * 带超时的 Promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, skillId: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Skill '${skillId}' 执行超时（${timeoutMs}ms）`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId!) {
        clearTimeout(timeoutId);
      }
    }
  }

  // ===================== 3. 通道管理 =====================

  /**
   * 获取通道状态
   *
   * @param lane - 通道类型
   * @returns 通道状态
   */
  getLaneStatus(lane: ExecutionLaneType): LaneStatus {
    const running = this.runningTasks.get(lane)!;
    const queue = this.queues.get(lane)!;
    const stats = this.stats.get(lane)!;
    const config = this.configs[lane];

    return {
      running: running.size,
      queued: queue.length,
      completed: stats.completed,
      failed: stats.failed,
      maxConcurrency: config.maxConcurrency,
    };
  }

  /**
   * 获取所有通道状态
   */
  getAllStatuses(): Record<ExecutionLaneType, LaneStatus> {
    const result = {} as Record<ExecutionLaneType, LaneStatus>;
    for (const lane of Object.keys(DEFAULT_LANE_CONFIGS) as ExecutionLaneType[]) {
      result[lane] = this.getLaneStatus(lane);
    }
    return result;
  }

  /**
   * 更新通道配置
   *
   * @param lane - 通道类型
   * @param config - 新配置
   */
  updateLaneConfig(lane: ExecutionLaneType, config: Partial<LaneConfig>): void {
    this.configs[lane] = {
      ...this.configs[lane],
      ...config,
    };
    logger.info(`[ExecutionLanes] Lane config updated: ${lane}`);
  }

  /**
   * 获取通道配置
   */
  getLaneConfig(lane: ExecutionLaneType): LaneConfig {
    return { ...this.configs[lane] };
  }

  // ===================== 4. 队列管理 =====================

  /**
   * 清空指定通道的队列
   *
   * @param lane - 通道类型
   * @returns 清空的任务数
   */
  clearQueue(lane: ExecutionLaneType): number {
    const queue = this.queues.get(lane)!;
    const count = queue.length;

    for (const task of queue) {
      task.resolve({
        success: false,
        error: '任务已取消（队列清空）',
      });
    }

    queue.length = 0;
    logger.info(`[ExecutionLanes] Queue cleared: ${lane} (${count} tasks)`);
    return count;
  }

  /**
   * 清空所有队列
   */
  clearAllQueues(): number {
    let total = 0;
    for (const lane of Object.keys(DEFAULT_LANE_CONFIGS) as ExecutionLaneType[]) {
      total += this.clearQueue(lane);
    }
    return total;
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalCompleted: number;
    totalFailed: number;
    totalRunning: number;
    totalQueued: number;
    byLane: Record<string, LaneStatus>;
  } {
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalRunning = 0;
    let totalQueued = 0;
    const byLane: Record<string, LaneStatus> = {};

    for (const lane of Object.keys(DEFAULT_LANE_CONFIGS) as ExecutionLaneType[]) {
      const status = this.getLaneStatus(lane);
      byLane[lane] = status;
      totalCompleted += status.completed;
      totalFailed += status.failed;
      totalRunning += status.running;
      totalQueued += status.queued;
    }

    return {
      totalCompleted,
      totalFailed,
      totalRunning,
      totalQueued,
      byLane,
    };
  }
}

// ===================== Module-level Singleton =====================

/** Skill 执行通道单例 */
export const skillExecutionLanes = new SkillExecutionLanes();
