/**
 * Worker 线程池 — 管理 chunkWorker 的复用和生命周期
 *
 * 避免每次压缩都创建新线程，提高性能：
 * - 预创建 Worker 线程池
 * - 任务队列管理
 * - 超时和错误处理
 * - 优雅关闭
 */

import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { logger } from '../../logger.js';
import type { ChunkPlan } from './chunkWorker.js';

/** Worker 任务输入 */
export interface WorkerTaskInput {
  messages: unknown[];
  maxTokens: number;
  safetyMargin: number;
  overheadTokens: number;
  maxSingleMessageTokens: number;
}

/** Worker 任务结果 */
export type WorkerTaskResult =
  | { kind: 'chunk-plan'; plan: ChunkPlan }
  | { kind: 'oversized-plan'; plan: { smallMessages: unknown[]; oversizedNotes: string[] } }
  | { kind: 'error'; error: string };

/** Worker 池配置 */
export interface WorkerPoolConfig {
  /** 池大小（默认 2） */
  poolSize?: number;
  /** 任务超时时间（毫秒，默认 30 秒） */
  taskTimeoutMs?: number;
}

/** 池中的 Worker 包装 */
interface PooledWorker {
  worker: Worker;
  busy: boolean;
  resolveTask?: (result: WorkerTaskResult) => void;
  rejectTask?: (error: Error) => void;
  timeoutTimer?: NodeJS.Timeout;
}

/** 默认配置 */
const DEFAULT_CONFIG: Required<WorkerPoolConfig> = {
  poolSize: 2,
  taskTimeoutMs: 30_000,
};

/** Worker 池实例 */
class ChunkWorkerPool {
  private workers: PooledWorker[] = [];
  private taskQueue: Array<{
    input: WorkerTaskInput;
    resolve: (result: WorkerTaskResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private config: Required<WorkerPoolConfig>;
  private initialized = false;
  private disposed = false;

  constructor(config?: WorkerPoolConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 初始化 Worker 池 */
  private init(): void {
    if (this.initialized || this.disposed) return;

    const workerPath = join(__dirname, 'chunkWorker.js');
    for (let i = 0; i < this.config.poolSize; i++) {
      try {
        const worker = new Worker(workerPath);
        const pooled: PooledWorker = {
          worker,
          busy: false,
        };

        worker.on('message', (msg: WorkerTaskResult) => {
          if (pooled.resolveTask) {
            if (pooled.timeoutTimer) clearTimeout(pooled.timeoutTimer);
            pooled.resolveTask(msg);
            pooled.resolveTask = undefined;
            pooled.rejectTask = undefined;
            pooled.busy = false;
            this.dispatchNext();
          }
        });

        worker.on('error', (err: Error) => {
          logger.error(`[WorkerPool] Worker ${i} 错误:`, err);
          if (pooled.rejectTask) {
            if (pooled.timeoutTimer) clearTimeout(pooled.timeoutTimer);
            pooled.rejectTask(err);
            pooled.resolveTask = undefined;
            pooled.rejectTask = undefined;
            pooled.busy = false;
            this.dispatchNext();
          }
        });

        this.workers.push(pooled);
      } catch (err) {
        logger.warn(`[WorkerPool] 创建 Worker ${i} 失败，将在主线程执行:`, err);
      }
    }

    this.initialized = true;
    logger.info(`[WorkerPool] 初始化完成，${this.workers.length} 个 Worker`);
  }

  /** 分配下一个任务 */
  private dispatchNext(): void {
    if (this.taskQueue.length === 0) return;

    const idleWorker = this.workers.find((w) => !w.busy && !this.disposed);
    if (!idleWorker) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    idleWorker.busy = true;
    idleWorker.resolveTask = task.resolve;
    idleWorker.rejectTask = task.reject;

    // 设置超时
    idleWorker.timeoutTimer = setTimeout(() => {
      if (idleWorker.rejectTask) {
        idleWorker.rejectTask(new Error(`Worker 任务超时 (${this.config.taskTimeoutMs}ms)`));
        idleWorker.resolveTask = undefined;
        idleWorker.rejectTask = undefined;
        idleWorker.busy = false;
      }
    }, this.config.taskTimeoutMs);

    idleWorker.worker.postMessage(task.input);
  }

  /** 提交任务 */
  async execute(input: WorkerTaskInput): Promise<WorkerTaskResult> {
    if (this.disposed) {
      throw new Error('[WorkerPool] 池已关闭');
    }

    if (!this.initialized) {
      this.init();
    }

    // 如果没有 Worker，在主线程执行
    if (this.workers.length === 0) {
      logger.debug('[WorkerPool] 无可用 Worker，在主线程执行');
      return executeInMainThread(input);
    }

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      this.taskQueue.push({ input, resolve, reject });
      this.dispatchNext();
    });
  }

  /** 优雅关闭 */
  async dispose(): Promise<void> {
    this.disposed = true;

    // 等待队列中的任务完成
    while (this.taskQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 终止所有 Worker
    await Promise.all(
      this.workers.map(async (pw) => {
        if (pw.timeoutTimer) clearTimeout(pw.timeoutTimer);
        await pw.worker.terminate();
      }),
    );

    this.workers = [];
    logger.info('[WorkerPool] 已关闭');
  }

  /** 检查池是否已关闭 */
  isDisposed(): boolean {
    return this.disposed;
  }
}

/** 主线程执行（降级方案） */
async function executeInMainThread(input: WorkerTaskInput): Promise<WorkerTaskResult> {
  // 动态导入避免循环依赖，并兼容 ESM 运行时
  const { buildChunkPlan, buildOversizedFallback, estimateMessagesTokens } =
    await import('./chunkWorker.js');

  // 检查超大消息
  const oversized = input.messages.some(
    (msg) => estimateMessagesTokens([msg]) > input.maxSingleMessageTokens,
  );

  if (oversized && input.messages.every(
    (msg) => estimateMessagesTokens([msg]) > input.maxSingleMessageTokens,
  )) {
    const plan = buildOversizedFallback(input);
    return { kind: 'oversized-plan', plan };
  }

  const plan = buildChunkPlan(input);
  return { kind: 'chunk-plan', plan };
}

/** 全局 Worker 池实例 */
let globalPool: ChunkWorkerPool | undefined;

/** 获取全局 Worker 池 */
export function getWorkerPool(config?: WorkerPoolConfig): ChunkWorkerPool {
  if (!globalPool || globalPool.isDisposed()) {
    globalPool = new ChunkWorkerPool(config);
  }
  return globalPool;
}

/** 关闭全局 Worker 池 */
export async function disposeWorkerPool(): Promise<void> {
  if (globalPool) {
    await globalPool.dispose();
    globalPool = undefined;
  }
}

/** 提交分块任务到 Worker 池 */
export async function submitChunkTask(input: WorkerTaskInput): Promise<WorkerTaskResult> {
  const pool = getWorkerPool();
  return pool.execute(input);
}

export const workerPool = {
  getWorkerPool,
  disposeWorkerPool,
  submitChunkTask,
};
