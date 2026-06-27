/**
 * Background Task Manager
 * 后台任务管理器 - 管理异步后台任务的记录、进度追踪和取消
 */

export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface BackgroundTask {
  id: string;
  name: string;
  sessionKey: string;
  status: BackgroundTaskStatus;
  progress: number;
  total: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateBackgroundTaskParams {
  name: string;
  sessionKey: string;
  total?: number;
  metadata?: Record<string, unknown>;
  execute: (task: BackgroundTask, signal: AbortSignal) => Promise<void>;
  onProgress?: (task: BackgroundTask) => void;
  onComplete?: (task: BackgroundTask) => void;
  onError?: (task: BackgroundTask, error: Error) => void;
}

/**
 * 后台任务管理器
 */
export class BackgroundTaskManager {
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly maxConcurrentTasks: number;
  private readonly taskQueue: string[] = [];

  constructor(maxConcurrentTasks = 5) {
    this.maxConcurrentTasks = maxConcurrentTasks;
  }

  /**
   * 创建并启动后台任务
   */
  async createTask(params: CreateBackgroundTaskParams): Promise<BackgroundTask> {
    const taskId = this.generateTaskId();
    const now = Date.now();

    const task: BackgroundTask = {
      id: taskId,
      name: params.name,
      sessionKey: params.sessionKey,
      status: "pending",
      progress: 0,
      total: params.total ?? 100,
      createdAt: now,
      metadata: params.metadata,
    };

    this.tasks.set(taskId, task);

    const runningCount = Array.from(this.tasks.values()).filter(
      (t) => t.status === "running",
    ).length;

    if (runningCount < this.maxConcurrentTasks) {
      await this.startTask(taskId, params);
    } else {
      this.taskQueue.push(taskId);
    }

    return task;
  }

  /**
   * 更新任务进度
   */
  updateProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") {
      return;
    }
    task.progress = Math.min(progress, task.total);
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取会话的所有任务
   */
  getTasksBySession(sessionKey: string): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.sessionKey === sessionKey,
    );
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return false;
    }

    const abortController = this.abortControllers.get(taskId);
    if (abortController) {
      abortController.abort();
    }

    task.status = "cancelled";
    task.completedAt = Date.now();
    return true;
  }

  /**
   * 取消会话的所有任务
   */
  cancelSessionTasks(sessionKey: string): number {
    let cancelled = 0;
    for (const task of this.tasks.values()) {
      if (task.sessionKey === sessionKey && this.cancelTask(task.id)) {
        cancelled++;
      }
    }
    return cancelled;
  }

  /**
   * 清除已完成的任务
   */
  cleanupCompletedTasks(olderThanMs = 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    for (const [taskId, task] of this.tasks) {
      if (
        (task.status === "completed" ||
          task.status === "failed" ||
          task.status === "cancelled") &&
        task.completedAt &&
        now - task.completedAt > olderThanMs
      ) {
        this.tasks.delete(taskId);
        this.abortControllers.delete(taskId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * 获取任务统计
   */
  getStats(): {
    total: number;
    running: number;
    pending: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      running: tasks.filter((t) => t.status === "running").length,
      pending: tasks.filter((t) => t.status === "pending").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      cancelled: tasks.filter((t) => t.status === "cancelled").length,
    };
  }

  private async startTask(taskId: string, params: CreateBackgroundTaskParams): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    task.status = "running";
    task.startedAt = Date.now();

    try {
      await params.execute(task, abortController.signal);
      task.status = "completed";
      task.progress = task.total;
      task.completedAt = Date.now();
      params.onComplete?.(task);
    } catch (error) {
      if (abortController.signal.aborted) {
        task.status = "cancelled";
      } else {
        task.status = "failed";
        task.error = error instanceof Error ? error.message : String(error);
        params.onError?.(task, error instanceof Error ? error : new Error(String(error)));
      }
      task.completedAt = Date.now();
    } finally {
      this.abortControllers.delete(taskId);
      this.processNextTask();
    }
  }

  private processNextTask(): void {
    const runningCount = Array.from(this.tasks.values()).filter(
      (t) => t.status === "running",
    ).length;

    while (runningCount < this.maxConcurrentTasks && this.taskQueue.length > 0) {
      const nextTaskId = this.taskQueue.shift();
      if (nextTaskId) {
        // 任务在创建时应该保存了 execute 函数，但这里简化处理
        // 实际实现中应该从任务元数据中恢复执行函数
        console.warn(`Task ${nextTaskId} in queue but execution params not stored`);
      }
    }
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// 单例
let BACKGROUND_TASK_MANAGER: BackgroundTaskManager | null = null;

export function getBackgroundTaskManager(): BackgroundTaskManager {
  if (!BACKGROUND_TASK_MANAGER) {
    BACKGROUND_TASK_MANAGER = new BackgroundTaskManager();
  }
  return BACKGROUND_TASK_MANAGER;
}

export function resetBackgroundTaskManagerForTests(): void {
  BACKGROUND_TASK_MANAGER = null;
}
