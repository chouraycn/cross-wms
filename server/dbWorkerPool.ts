/**
 * SQLite Worker Thread Pool
 *
 * 管理多个 Worker 线程，通过轮询分配查询任务。
 * 提供与 better-sqlite3 兼容的异步 API。
 */
import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

// Worker 线程数量：默认 2 个（读写分离），最多 4 个
const WORKER_COUNT = Math.min(Math.max(os.cpus().length > 4 ? 2 : 1, 2), 4);

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WorkerWrapper {
  worker: Worker;
  pending: Map<number, PendingRequest>;
  nextId: number;
  queue: Array<{ msg: Record<string, unknown>; resolve: (v: unknown) => void; reject: (r: unknown) => void }>;
  busy: boolean;
}

export class DbWorkerPool {
  private workers: WorkerWrapper[] = [];
  private workerIndex = 0;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /** 初始化 Worker 线程池 */
  init(): void {
    if (this.initialized) return;

    const workerScript = path.join(__dirname, 'dbWorker.ts');

    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(workerScript, {
        workerData: { dbPath: this.dbPath },
        execArgv: ['--loader', 'tsx/esm'],
      });

      const wrapper: WorkerWrapper = {
        worker,
        pending: new Map(),
        nextId: 1,
        queue: [],
        busy: false,
      };

      worker.on('message', (msg: { id: number; result: unknown; error: string | null }) => {
        const pending = wrapper.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          wrapper.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        // 处理队列中的下一个请求
        this.processQueue(wrapper);
      });

      worker.on('error', (err) => {
        logger.error('[DbWorkerPool] Worker error:', err);
      });

      this.workers.push(wrapper);
    }

    this.initialized = true;
  }

  /** 分配请求到下一个 Worker（轮询） */
  private dispatch(msg: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const wrapper = this.workers[this.workerIndex];
      this.workerIndex = (this.workerIndex + 1) % this.workers.length;

      const id = wrapper.nextId++;
      const timer = setTimeout(() => {
        wrapper.pending.delete(id);
        reject(new Error('Database operation timeout (10s)'));
        this.processQueue(wrapper);
      }, 10000);

      wrapper.pending.set(id, { resolve, reject, timer });

      if (wrapper.busy) {
        // Worker 正在处理，加入队列
        wrapper.queue.push({ msg: { ...msg, id }, resolve, reject });
      } else {
        wrapper.busy = true;
        wrapper.worker.postMessage({ ...msg, id });
      }
    });
  }

  /** 处理队列中的下一个请求 */
  private processQueue(wrapper: WorkerWrapper): void {
    if (wrapper.queue.length === 0) {
      wrapper.busy = false;
      return;
    }
    const next = wrapper.queue.shift()!;
    wrapper.busy = true;
    const id = wrapper.nextId++;
    const timer = setTimeout(() => {
      wrapper.pending.delete(id);
      next.reject(new Error('Database operation timeout (10s)'));
      this.processQueue(wrapper);
    }, 10000);
    wrapper.pending.set(id, { resolve: next.resolve, reject: next.reject, timer });
    wrapper.worker.postMessage({ ...next.msg, id });
  }

  /** 异步执行 prepare().all() */
  async all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.dispatch({ type: 'prepare', sql, params, method: 'all' }) as Promise<T[]>;
  }

  /** 异步执行 prepare().get() */
  async get<T = unknown>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return this.dispatch({ type: 'prepare', sql, params, method: 'get' }) as Promise<T | undefined>;
  }

  /** 异步执行 prepare().run() */
  async run(sql: string, ...params: unknown[]): Promise<unknown> {
    return this.dispatch({ type: 'prepare', sql, params, method: 'run' });
  }

  /** 异步执行 exec() */
  async exec(sql: string): Promise<void> {
    return this.dispatch({ type: 'exec', sql }) as Promise<void>;
  }

  /** 异步执行 pragma() */
  async pragma(sql: string): Promise<unknown> {
    return this.dispatch({ type: 'pragma', sql });
  }

  /** 异步事务 */
  async transaction(ops: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    return this.dispatch({ type: 'transaction', params: ops }) as Promise<void>;
  }

  /** 关闭所有 Worker */
  close(): void {
    for (const wrapper of this.workers) {
      wrapper.worker.postMessage({ type: 'close' });
      wrapper.worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
  }
}
