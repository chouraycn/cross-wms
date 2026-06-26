/**
 * 并行执行车道系统
 * @description 用于管理不同类型任务的并行执行，通过车道隔离确保关键任务不被阻塞
 * @module executionLanes
 */

import { randomUUID } from "crypto";

// ============================================================================
// 枚举定义
// ============================================================================

/**
 * 命令执行车道枚举
 * @description 定义不同类型的任务车道，用于并行执行时的任务隔离
 */
export enum CommandLane {
  /** 主车道（默认）- 用于普通命令执行，无并发限制 */
  Main = "main",
  /** 定时任务车道 - 用于定时任务的执行 */
  Cron = "cron",
  /** 定时任务嵌套车道 - 用于定时任务内部触发的嵌套任务 */
  CronNested = "cron-nested",
  /** 子 Agent 车道 - 用于子 Agent 任务的执行 */
  Subagent = "subagent",
  /** 嵌套任务车道 - 用于普通嵌套任务的执行 */
  Nested = "nested",
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务状态枚举
 */
export type TaskStatus = "pending" | "running" | "completed" | "failed";

/**
 * 车道任务接口
 * @description 定义任务的完整结构，包括状态、依赖、父子关系等
 */
export interface LaneTask<T = unknown> {
  /** 任务 ID - 全局唯一标识 */
  id: string;
  /** 所在车道 */
  lane: CommandLane | string;
  /** 优先级 - 数字越小优先级越高 */
  priority: number;
  /** 任务数据载荷 */
  payload: T;
  /** 任务状态 */
  status: TaskStatus;
  /** 任务创建时间戳 */
  createdAt: number;
  /** 任务开始时间戳 */
  startedAt?: number;
  /** 任务完成时间戳 */
  completedAt?: number;
  /** 错误信息 */
  error?: string;
  /** 任务执行结果 */
  result?: unknown;
  /** 依赖的任务 ID 数组 */
  dependsOn?: string[];
  /** 父任务 ID - 用于嵌套任务的层级追踪 */
  parentTaskId?: string;
}

/**
 * 车道状态信息
 */
export interface LaneStatus {
  /** 车道名称 */
  lane: string;
  /** 待处理任务数 */
  pendingCount: number;
  /** 运行中任务数 */
  runningCount: number;
  /** 已完成任务数 */
  completedCount: number;
  /** 失败任务数 */
  failedCount: number;
  /** 当前并发数 */
  currentConcurrency: number;
  /** 最大并发限制 */
  maxConcurrency: number;
}

/**
 * 任务执行器接口
 * @description 定义任务执行器的标准接口
 * @template T - 任务载荷类型
 * @template R - 执行结果类型
 */
export interface LaneExecutor<T, R> {
  /**
   * 执行任务
   * @param task - 要执行的任务
   * @returns Promise<执行结果>
   */
  execute(task: LaneTask<T>): Promise<R>;
  /**
   * 任务执行完成回调
   * @param task - 完成的任务
   * @param result - 执行结果
   */
  onComplete?: (task: LaneTask<T>, result: R) => void;
  /**
   * 任务执行失败回调
   * @param task - 失败的任务
   * @param error - 错误对象
   */
  onError?: (task: LaneTask<T>, error: Error) => void;
}

/**
 * 任务执行选项
 */
export interface TaskExecutionOptions {
  /** 是否等待依赖任务完成 */
  waitForDependencies?: boolean;
  /** 任务超时时间（毫秒） */
  timeout?: number;
  /** 执行优先级 */
  priority?: number;
}

// ============================================================================
// 车道并发配置
// ============================================================================

/**
 * 车道并发配置
 * @description 定义每个车道的最大并发数
 */
const LANE_CONCURRENCY_CONFIG: Readonly<Record<string, number>> = {
  [CommandLane.Main]: Infinity, // 主车道无限制
  [CommandLane.Cron]: 5, // 定时任务车道最多5个并发
  [CommandLane.Subagent]: 3, // 子 Agent 车道最多3个并发
  [CommandLane.Nested]: 2, // 嵌套任务车道最多2个并发
  [CommandLane.CronNested]: 1, // 定时任务嵌套车道最多1个并发
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成唯一任务 ID
 * @returns 唯一标识符字符串
 */
function generateTaskId(): string {
  return randomUUID();
}

/**
 * 获取车道的最大并发数
 * @param lane - 车道名称
 * @returns 最大并发数
 */
function getLaneMaxConcurrency(lane: string): number {
  return LANE_CONCURRENCY_CONFIG[lane] ?? 1;
}

// ============================================================================
// LaneManager 类
// ============================================================================

/**
 * 车道管理器
 * @description 单例类，负责管理所有车道的任务队列和执行状态
 * @threadSafe 使用 Map 和数组实现线程安全的任务管理
 */
export class LaneManager {
  /** 任务映射表 - taskId -> LaneTask */
  private taskStore: Map<string, LaneTask> = new Map();
  /** 车道队列映射表 - lane -> LaneTask[] */
  private laneQueues: Map<string, LaneTask[]> = new Map();
  /** 车道运行中任务映射 - lane -> Set<taskId> */
  private laneRunningTasks: Map<string, Set<string>> = new Map();
  /** 嵌套车道映射 - sessionKey -> lane */
  private sessionNestedLanes: Map<string, string> = new Map();
  /** 父子任务映射 - parentTaskId -> childTaskIds[] */
  private childTaskMap: Map<string, string[]> = new Map();

  /**
   * 将任务加入指定车道
   * @template T - 任务载荷类型
   * @param task - 任务对象（若未提供 id 将自动生成）
   * @param lane - 目标车道（默认为主车道）
   * @returns 已入队的任务（包含生成的 id）
   */
  enqueue<T>(task: Partial<LaneTask<T>>, lane: CommandLane | string = CommandLane.Main): LaneTask<T> {
    const fullTask: LaneTask<T> = {
      id: task.id ?? generateTaskId(),
      lane,
      priority: task.priority ?? 100,
      payload: task.payload as T,
      status: "pending",
      createdAt: Date.now(),
      dependsOn: task.dependsOn,
      parentTaskId: task.parentTaskId,
    };

    // 存储任务
    this.taskStore.set(fullTask.id, fullTask);

    // 加入车道队列
    const queue = this.laneQueues.get(lane) ?? [];
    queue.push(fullTask);
    // 按优先级排序（数字越小优先级越高）
    queue.sort((a, b) => a.priority - b.priority);
    this.laneQueues.set(lane, queue);

    return fullTask;
  }

  /**
   * 从指定车道取出任务
   * @param lane - 车道名称
   * @returns 下一个要执行的任务，若车道为空或已达并发上限则返回 undefined
   */
  dequeue(lane: string): LaneTask | undefined {
    const maxConcurrency = getLaneMaxConcurrency(lane);
    const runningTasks = this.laneRunningTasks.get(lane) ?? new Set();

    // 检查是否达到并发上限
    if (runningTasks.size >= maxConcurrency) {
      return undefined;
    }

    const queue = this.laneQueues.get(lane);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    // 找到第一个可执行的任务（满足依赖条件）
    for (let i = 0; i < queue.length; i++) {
      const task = queue[i];
      if (task.status === "pending" && this.canExecuteTask(task)) {
        // 从队列中移除
        queue.splice(i, 1);
        // 标记为运行中
        task.status = "running";
        task.startedAt = Date.now();
        runningTasks.add(task.id);
        this.laneRunningTasks.set(lane, runningTasks);
        this.taskStore.set(task.id, task);
        return task;
      }
    }

    return undefined;
  }

  /**
   * 将嵌套任务加入队列
   * @template T - 任务载荷类型
   * @param parentTaskId - 父任务 ID
   * @param task - 要入队的任务
   * @param sessionKey - 会话键（可选，用于生成会话专属嵌套车道）
   * @returns 入队后的任务
   */
  enqueueNested<T>(
    parentTaskId: string,
    task: Partial<LaneTask<T>>,
    sessionKey?: string
  ): LaneTask<T> {
    const nestedLane = this.getNestedLaneForSession(sessionKey);

    const fullTask: LaneTask<T> = {
      id: task.id ?? generateTaskId(),
      lane: nestedLane,
      priority: task.priority ?? 90,
      payload: task.payload as T,
      status: "pending",
      createdAt: Date.now(),
      dependsOn: task.dependsOn,
      parentTaskId,
    };

    // 建立父子关系
    const childIds = this.childTaskMap.get(parentTaskId) ?? [];
    childIds.push(fullTask.id);
    this.childTaskMap.set(parentTaskId, childIds);

    // 存储任务
    this.taskStore.set(fullTask.id, fullTask);

    // 加入嵌套车道队列
    const queue = this.laneQueues.get(nestedLane) ?? [];
    queue.push(fullTask);
    queue.sort((a, b) => a.priority - b.priority);
    this.laneQueues.set(nestedLane, queue);

    return fullTask;
  }

  /**
   * 将子 Agent 任务加入队列
   * @template T - 任务载荷类型
   * @param task - 要入队的任务
   * @returns 入队后的任务
   */
  enqueueSubagent<T>(task: Partial<LaneTask<T>>): LaneTask<T> {
    return this.enqueue(task, CommandLane.Subagent);
  }

  /**
   * 将定时任务加入队列
   * @template T - 任务载荷类型
   * @param task - 要入队的任务
   * @returns 入队后的任务
   */
  enqueueCron<T>(task: Partial<LaneTask<T>>): LaneTask<T> {
    return this.enqueue(task, CommandLane.Cron);
  }

  /**
   * 获取指定车道中的所有任务
   * @param lane - 车道名称
   * @returns 任务数组
   */
  getLaneTasks(lane: string): LaneTask[] {
    const queue = this.laneQueues.get(lane) ?? [];
    const runningTasks = this.laneRunningTasks.get(lane) ?? new Set();
    const running: LaneTask[] = [];
    const pending: LaneTask[] = [];

    // 从队列获取待处理任务
    for (const task of queue) {
      if (task.status === "pending") {
        pending.push(task);
      }
    }

    // 从运行中任务获取
    Array.from(runningTasks).forEach((taskId) => {
      const task = this.taskStore.get(taskId);
      if (task) {
        running.push(task);
      }
    });

    return [...running, ...pending];
  }

  /**
   * 获取任务详情
   * @param taskId - 任务 ID
   * @returns 任务对象，若不存在则返回 undefined
   */
  getTask(taskId: string): LaneTask | undefined {
    return this.taskStore.get(taskId);
  }

  /**
   * 标记任务完成
   * @param taskId - 任务 ID
   * @param result - 任务执行结果
   */
  completeTask(taskId: string, result?: unknown): void {
    const task = this.taskStore.get(taskId);
    if (!task) {
      return;
    }

    task.status = "completed";
    task.completedAt = Date.now();
    task.result = result;

    // 从运行中移除
    const runningTasks = this.laneRunningTasks.get(task.lane);
    if (runningTasks) {
      runningTasks.delete(taskId);
    }

    this.taskStore.set(taskId, task);
  }

  /**
   * 标记任务失败
   * @param taskId - 任务 ID
   * @param error - 错误信息
   */
  failTask(taskId: string, error: string): void {
    const task = this.taskStore.get(taskId);
    if (!task) {
      return;
    }

    task.status = "failed";
    task.completedAt = Date.now();
    task.error = error;

    // 从运行中移除
    const runningTasks = this.laneRunningTasks.get(task.lane);
    if (runningTasks) {
      runningTasks.delete(taskId);
    }

    this.taskStore.set(taskId, task);
  }

  /**
   * 取消任务
   * @param taskId - 任务 ID
   * @returns 是否成功取消
   */
  cancelTask(taskId: string): boolean {
    const task = this.taskStore.get(taskId);
    if (!task) {
      return false;
    }

    // 只能取消待处理状态的任务
    if (task.status !== "pending") {
      return false;
    }

    // 从队列中移除
    const queue = this.laneQueues.get(task.lane);
    if (queue) {
      const index = queue.findIndex((t) => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }

    // 更新任务状态
    task.status = "failed";
    task.completedAt = Date.now();
    task.error = "Task cancelled";
    this.taskStore.set(taskId, task);

    return true;
  }

  /**
   * 获取所有车道状态
   * @returns 所有车道状态信息数组
   */
  getAllLaneStatus(): LaneStatus[] {
    const allLanes = new Set<string>();

    for (const lane of this.laneQueues.keys()) {
      allLanes.add(lane);
    }
    for (const lane of this.laneRunningTasks.keys()) {
      allLanes.add(lane);
    }

    for (const lane of Object.values(CommandLane)) {
      allLanes.add(lane);
    }

    return Array.from(allLanes).map((lane) => this.getLaneStatus(lane));
  }

  /**
   * 获取车道状态
   * @param lane - 车道名称
   * @returns 车道状态信息
   */
  getLaneStatus(lane: string): LaneStatus {
    const queue = this.laneQueues.get(lane) ?? [];
    const runningTasks = this.laneRunningTasks.get(lane) ?? new Set();
    const maxConcurrency = getLaneMaxConcurrency(lane);

    let pendingCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    // 统计队列中待处理任务
    for (const task of queue) {
      if (task.status === "pending") pendingCount++;
      else if (task.status === "completed") completedCount++;
      else if (task.status === "failed") failedCount++;
    }

    // 统计运行中任务
    Array.from(runningTasks).forEach((taskId) => {
      const task = this.taskStore.get(taskId);
      if (task) {
        if (task.status === "completed") completedCount++;
        else if (task.status === "failed") failedCount++;
        // running 状态的任务不算在队列中
      }
    });

    return {
      lane,
      pendingCount,
      runningCount: runningTasks.size,
      completedCount,
      failedCount,
      currentConcurrency: runningTasks.size,
      maxConcurrency,
    };
  }

  /**
   * 获取会话对应的嵌套车道
   * @param sessionKey - 会话键
   * @returns 嵌套车道名称
   */
  getNestedLaneForSession(sessionKey?: string): string {
    if (!sessionKey) {
      return CommandLane.Nested;
    }

    // 检查缓存
    const cached = this.sessionNestedLanes.get(sessionKey);
    if (cached) {
      return cached;
    }

    // 生成新的嵌套车道
    const nestedLane = `nested:${sessionKey}`;
    this.sessionNestedLanes.set(sessionKey, nestedLane);

    // 初始化该车道
    if (!this.laneQueues.has(nestedLane)) {
      this.laneQueues.set(nestedLane, []);
    }
    if (!this.laneRunningTasks.has(nestedLane)) {
      this.laneRunningTasks.set(nestedLane, new Set());
    }

    return nestedLane;
  }

  /**
   * 解析定时任务车道
   * @param lane - 原始车道名称
   * @returns 解析后的定时任务车道
   */
  resolveCronLane(lane?: string): string {
    if (!lane || lane === CommandLane.Cron) {
      return CommandLane.CronNested;
    }
    return lane;
  }

  /**
   * 判断是否为嵌套车道
   * @param lane - 车道名称
   * @returns 是否为嵌套车道
   */
  isNestedLane(lane: string): boolean {
    return lane === CommandLane.Nested || lane.startsWith("nested:");
  }

  /**
   * 检查任务是否可以执行（依赖是否满足）
   * @param task - 要检查的任务
   * @returns 是否可以执行
   */
  private canExecuteTask(task: LaneTask): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    for (const depId of task.dependsOn) {
      const depTask = this.taskStore.get(depId);
      if (!depTask) {
        continue; // 依赖任务不存在，假设已满足
      }
      if (depTask.status !== "completed" && depTask.status !== "failed") {
        return false; // 依赖任务未完成
      }
    }

    return true;
  }

  /**
   * 等待任务依赖完成
   * @param taskId - 任务 ID
   * @returns Promise - 等待依赖完成后解析
   */
  async waitForDependencies(taskId: string): Promise<void> {
    const task = this.taskStore.get(taskId);
    if (!task) {
      return;
    }

    if (!task.dependsOn || task.dependsOn.length === 0) {
      return;
    }

    // 轮询检查依赖任务状态
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        let allCompleted = true;

        for (const depId of task.dependsOn!) {
          const depTask = this.taskStore.get(depId);
          if (!depTask) {
            continue;
          }
          if (depTask.status !== "completed" && depTask.status !== "failed") {
            allCompleted = false;
            break;
          }
        }

        if (allCompleted) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * 获取所有任务（用于调试）
   * @returns 所有任务的映射
   */
  getAllTasks(): Map<string, LaneTask> {
    return new Map(this.taskStore);
  }

  /**
   * 清空所有任务和队列（用于测试）
   */
  clear(): void {
    this.taskStore.clear();
    this.laneQueues.clear();
    this.laneRunningTasks.clear();
    this.sessionNestedLanes.clear();
    this.childTaskMap.clear();
  }
}

// ============================================================================
// LaneExecutionContext 类
// ============================================================================

/**
 * 车道执行上下文
 * @description 提供任务执行的上下文环境，支持并发限制和执行器管理
 */
export class LaneExecutionContext {
  /** 车道管理器实例 */
  private laneManager: LaneManager;

  constructor(laneManager: LaneManager) {
    this.laneManager = laneManager;
  }

  /**
   * 使用指定执行器运行任务
   * @template T - 任务载荷类型
   * @template R - 执行结果类型
   * @param task - 任务对象
   * @param executor - 任务执行器
   * @param options - 执行选项
   * @returns Promise<执行结果>
   */
  async runWithExecutor<T, R>(
    task: LaneTask<T>,
    executor: LaneExecutor<T, R>,
    options?: TaskExecutionOptions
  ): Promise<R> {
    // 等待依赖任务完成
    if (options?.waitForDependencies !== false) {
      await this.laneManager.waitForDependencies(task.id);
    }

    // 从队列取出任务
    const dequeuedTask = this.laneManager.dequeue(task.lane);
    if (!dequeuedTask) {
      throw new Error(`Failed to dequeue task ${task.id} from lane ${task.lane}`);
    }

    try {
      // 执行任务
      const result = await executor.execute(dequeuedTask as LaneTask<T>);

      // 标记完成
      this.laneManager.completeTask(dequeuedTask.id, result);

      // 调用完成回调
      if (executor.onComplete) {
        executor.onComplete(dequeuedTask as LaneTask<T>, result);
      }

      return result;
    } catch (error) {
      // 标记失败
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.laneManager.failTask(dequeuedTask.id, errorMessage);

      // 调用错误回调
      if (executor.onError) {
        executor.onError(dequeuedTask as LaneTask<T>, error as Error);
      }

      throw error;
    }
  }

  /**
   * 使用并发限制执行多个任务
   * @template T - 任务载荷类型
   * @template R - 执行结果类型
   * @param tasks - 任务数组
   * @param executor - 任务执行器
   * @param maxConcurrency - 最大并发数
   * @returns Promise<结果数组>
   */
  async runWithConcurrencyLimit<T, R>(
    tasks: LaneTask<T>[],
    executor: LaneExecutor<T, R>,
    maxConcurrency: number
  ): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];
    let taskIndex = 0;

    const executeNext = async (): Promise<void> => {
      while (taskIndex < tasks.length) {
        const currentIndex = taskIndex++;
        const task = tasks[currentIndex];

        if (!task) continue;

        try {
          const result = await this.runWithExecutor(task, executor);
          results[currentIndex] = result;
        } catch {
          // 错误已在 runWithExecutor 中处理
          results[currentIndex] = undefined as unknown as R;
        }
      }
    };

    // 启动并发执行
    for (let i = 0; i < maxConcurrency; i++) {
      executing.push(executeNext());
    }

    await Promise.all(executing);
    return results.filter((r) => r !== undefined) as R[];
  }

  /**
   * 等待指定任务的所有依赖完成
   * @param taskId - 任务 ID
   */
  async waitForDependencies(taskId: string): Promise<void> {
    await this.laneManager.waitForDependencies(taskId);
  }
}

// ============================================================================
// 单例导出
// ============================================================================

/**
 * 默认车道管理器实例（单例）
 */
export const laneManager = new LaneManager();

/**
 * 默认执行上下文实例
 */
export const laneExecutionContext = new LaneExecutionContext(laneManager);

/**
 * 默认导出车道管理器
 */
export default laneManager;
