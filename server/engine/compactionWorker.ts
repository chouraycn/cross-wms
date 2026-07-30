/**
 * CompactionWorker — 上下文压缩 Worker 线程池
 *
 * 将上下文压缩的 token 估算与截断计算移到 worker 线程中执行，
 * 避免大消息体的 CPU 密集型计算阻塞主线程（事件循环）。
 *
 * 设计要点：
 * - 内联 worker 源码（`new Worker(code, { eval: true })`），不额外创建 worker 入口文件
 * - Worker 池复用线程，默认 2 个 worker，任务队列调度
 * - 降级机制：worker 创建失败时回退到主线程，复用现有 `truncateContextForModel`
 *
 * 消息协议：
 * - 主线程 → worker：`CompactionWorkerInput`
 * - worker → 主线程：`{ ok: true, result: CompactionWorkerOutput }` 或 `{ ok: false, error: string }`
 *
 * 参考：server/engine/compaction/workerPool.ts（chunk worker 池实现）
 */

import { Worker } from 'node:worker_threads';
import { logger } from '../logger.js';
import {
  truncateContextForModel,
  estimateMessagesTokens,
  type ApiMessage,
} from './contextTruncate.js';

// ==================== 类型定义 ====================

/** Worker 压缩任务输入 */
export type CompactionWorkerInput = {
  /** 待压缩的消息列表（仅含 role 与字符串 content） */
  messages: Array<{ role: string; content: string }>;
  /** 模型上下文窗口上限（tokens） */
  modelMaxTokens: number;
  /** 为输出/工具等预留的 tokens 数量 */
  reserveTokens: number;
  /** 可选的摘要提示词，用于在 summary 中附加上下文 */
  summaryPrompt?: string;
};

/** Worker 压缩任务输出 */
export type CompactionWorkerOutput = {
  /** 是否发生了截断 */
  truncated: boolean;
  /** 压缩前的 token 估算数 */
  originalTokenCount: number;
  /** 压缩后的 token 估算数 */
  truncatedTokenCount: number;
  /** 压缩摘要（无 LLM 调用，仅为元信息描述） */
  summary?: string;
  /** 保留的消息条数 */
  retainedMessages: number;
};

/** Worker 池内部传输协议（不对调用方暴露） */
type WireMessage =
  | { ok: true; result: CompactionWorkerOutput }
  | { ok: false; error: string };

// ==================== Worker 内联源码 ====================

/**
 * Worker 线程内联源码。
 *
 * 使用 `require` + `var` 以兼容 `eval: true` 的 CommonJS 脚本上下文；
 * 不使用模板字符串与 `import`，避免与外层模板字面量冲突或 ESM 解析问题。
 *
 * 逻辑：
 * 1. 估算每条消息的 token 数（与 contextTruncate.estimateTokens 保持一致）
 * 2. 若总量未超预算（modelMaxTokens - reserveTokens），返回未截断
 * 3. 否则从后往前保留消息直到预算耗尽，返回截断元信息
 */
const WORKER_SOURCE = `
var parentPort = require('node:worker_threads').parentPort;

function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  var tokens = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if ((code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x20000 && code <= 0x2a6df)) {
      tokens += 1.5;
    } else if (code === 0x7b || code === 0x7d ||
               code === 0x5b || code === 0x5d ||
               code === 0x22 || code === 0x3a ||
               code === 0x2c || code === 0x5c ||
               code === 0x2f || code === 0x3c ||
               code === 0x3e || code === 0x3d ||
               code === 0x7c || code === 0x60) {
      tokens += 0.8;
    } else {
      tokens += 0.35;
    }
  }
  return Math.ceil(tokens * 1.5);
}

function estimateMessageTokens(msg) {
  var total = 4; // role + formatting overhead
  if (msg && typeof msg.content === 'string') {
    total += estimateTokens(msg.content);
  }
  return total;
}

function compact(input) {
  var messages = (input && input.messages) || [];
  var originalTokenCount = 0;
  for (var i = 0; i < messages.length; i++) {
    originalTokenCount += estimateMessageTokens(messages[i]);
  }
  var budget = input.modelMaxTokens - input.reserveTokens;
  if (budget < 0) budget = 0;

  if (originalTokenCount <= budget) {
    return {
      truncated: false,
      originalTokenCount: originalTokenCount,
      truncatedTokenCount: originalTokenCount,
      retainedMessages: messages.length
    };
  }

  // 从后往前保留（最新消息优先），直到预算耗尽
  var retained = 0;
  var truncatedTokenCount = 0;
  for (var i = messages.length - 1; i >= 0; i--) {
    var t = estimateMessageTokens(messages[i]);
    if (truncatedTokenCount + t > budget) break;
    truncatedTokenCount += t;
    retained++;
  }

  var dropped = messages.length - retained;
  var summary;
  if (input.summaryPrompt) {
    summary = input.summaryPrompt + ' (已压缩 ' + dropped + ' 条早期消息，保留最近 ' + retained + ' 条)';
  } else {
    summary = '已压缩 ' + dropped + ' 条早期消息，保留最近 ' + retained + ' 条';
  }

  return {
    truncated: true,
    originalTokenCount: originalTokenCount,
    truncatedTokenCount: truncatedTokenCount,
    retainedMessages: retained,
    summary: summary
  };
}

if (parentPort) {
  parentPort.on('message', function (input) {
    try {
      var result = compact(input);
      parentPort.postMessage({ ok: true, result: result });
    } catch (err) {
      var msg = (err && err.message) ? err.message : String(err);
      parentPort.postMessage({ ok: false, error: msg });
    }
  });
}
`;

// ==================== Worker 池实现 ====================

/** 池中单个 worker 的运行时状态 */
interface PooledWorker {
  worker: Worker;
  busy: boolean;
  resolveTask?: (out: CompactionWorkerOutput) => void;
  rejectTask?: (err: Error) => void;
  timeoutTimer?: NodeJS.Timeout;
}

/** 待执行任务 */
interface QueuedTask {
  input: CompactionWorkerInput;
  resolve: (out: CompactionWorkerOutput) => void;
  reject: (err: Error) => void;
}

/** Worker 池配置 */
export interface CompactionWorkerPoolOptions {
  /** 池大小（默认 2） */
  poolSize?: number;
  /** 单任务超时（毫秒，默认 30000） */
  taskTimeoutMs?: number;
}

/** 默认池大小 */
const DEFAULT_POOL_SIZE = 2;
/** 默认任务超时 */
const DEFAULT_TASK_TIMEOUT_MS = 30_000;

/**
 * 上下文压缩 Worker 线程池。
 *
 * 预创建若干 worker 线程，复用执行多次压缩任务；
 * worker 创建失败或运行异常时自动降级到主线程同步执行。
 */
export class CompactionWorkerPool {
  private workers: PooledWorker[] = [];
  private queue: QueuedTask[] = [];
  private readonly poolSize: number;
  private readonly taskTimeoutMs: number;
  private initialized = false;
  private disposed = false;

  constructor(options?: CompactionWorkerPoolOptions) {
    this.poolSize = options?.poolSize ?? DEFAULT_POOL_SIZE;
    this.taskTimeoutMs = options?.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  }

  /**
   * 初始化 worker 池。
   *
   * 若 worker 创建失败（如运行时不支持 worker_threads），池为空，
   * 后续 `compact()` 调用将降级到主线程执行。
   */
  private init(): void {
    if (this.initialized || this.disposed) return;

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(WORKER_SOURCE, { eval: true });
        const pooled: PooledWorker = { worker, busy: false };

        worker.on('message', (msg: WireMessage) => {
          if (!pooled.resolveTask) return;
          if (pooled.timeoutTimer) {
            clearTimeout(pooled.timeoutTimer);
            pooled.timeoutTimer = undefined;
          }
          if (msg.ok) {
            pooled.resolveTask(msg.result);
          } else {
            pooled.rejectTask(new Error(msg.error));
          }
          pooled.resolveTask = undefined;
          pooled.rejectTask = undefined;
          pooled.busy = false;
          this.dispatchNext();
        });

        worker.on('error', (err: Error) => {
          logger.error('[CompactionWorkerPool] worker 错误:', err);
          if (pooled.rejectTask) {
            if (pooled.timeoutTimer) {
              clearTimeout(pooled.timeoutTimer);
              pooled.timeoutTimer = undefined;
            }
            pooled.rejectTask(err);
            pooled.resolveTask = undefined;
            pooled.rejectTask = undefined;
            pooled.busy = false;
            this.dispatchNext();
          }
        });

        this.workers.push(pooled);
      } catch (err) {
        logger.warn(
          '[CompactionWorkerPool] 创建 worker ' + i + ' 失败，将降级到主线程:',
          err,
        );
      }
    }

    this.initialized = true;
    logger.info(
      '[CompactionWorkerPool] 初始化完成，' + this.workers.length + ' 个 worker',
    );
  }

  /**
   * 分发队列中的下一个任务到空闲 worker。
   */
  private dispatchNext(): void {
    if (this.disposed || this.queue.length === 0) return;

    const idle = this.workers.find((w) => !w.busy);
    if (!idle) return;

    const task = this.queue.shift();
    if (!task) return;

    idle.busy = true;
    idle.resolveTask = task.resolve;
    idle.rejectTask = task.reject;

    idle.timeoutTimer = setTimeout(() => {
      if (idle.rejectTask) {
        idle.rejectTask(
          new Error('CompactionWorker 任务超时 (' + this.taskTimeoutMs + 'ms)'),
        );
        idle.resolveTask = undefined;
        idle.rejectTask = undefined;
        idle.busy = false;
      }
    }, this.taskTimeoutMs);

    idle.worker.postMessage(task.input);
  }

  /**
   * 提交压缩任务到 worker 池。
   *
   * 若池中无可用 worker（创建失败或已关闭），降级到主线程同步执行，
   * 复用现有 `truncateContextForModel` 实现。
   *
   * @param input 压缩任务输入
   * @returns 压缩结果
   */
  async compact(input: CompactionWorkerInput): Promise<CompactionWorkerOutput> {
    if (this.disposed) {
      throw new Error('[CompactionWorkerPool] 池已关闭');
    }

    if (!this.initialized) {
      this.init();
    }

    // 无可用 worker — 降级到主线程
    if (this.workers.length === 0) {
      logger.debug('[CompactionWorkerPool] 无可用 worker，在主线程执行压缩');
      return compactInMainThread(input);
    }

    return new Promise<CompactionWorkerOutput>((resolve, reject) => {
      this.queue.push({ input, resolve, reject });
      this.dispatchNext();
    });
  }

  /**
   * 销毁 worker 池，终止所有 worker 线程并清理定时器。
   *
   * 注意：`destroy` 为同步方法，`worker.terminate()` 返回的 Promise 不被 await
   * （fire-and-forget）。队列中尚未执行的任务会被拒绝。
   */
  destroy(): void {
    this.disposed = true;

    // 拒绝队列中待执行的任务
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      task?.reject(new Error('[CompactionWorkerPool] 池已关闭，任务被取消'));
    }

    // 终止所有 worker 并清理定时器
    for (const pooled of this.workers) {
      if (pooled.timeoutTimer) {
        clearTimeout(pooled.timeoutTimer);
        pooled.timeoutTimer = undefined;
      }
      pooled.worker.terminate().catch((err) => {
        logger.warn('[CompactionWorkerPool] terminate 异常:', err);
      });
    }
    this.workers = [];

    logger.info('[CompactionWorkerPool] 已销毁');
  }

  /** 是否已销毁 */
  isDisposed(): boolean {
    return this.disposed;
  }
}

// ==================== 降级实现（主线程） ====================

/**
 * 主线程降级压缩实现。
 *
 * 复用现有 `truncateContextForModel`：以 `modelMaxTokens` 作为上下文窗口、
 * `reserveTokens` 作为输出预留、`toolsCount=0` 进行硬截断，
 * 再将结果适配为 `CompactionWorkerOutput`。
 */
function compactInMainThread(input: CompactionWorkerInput): CompactionWorkerOutput {
  const apiMessages: ApiMessage[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const originalTokenCount = estimateMessagesTokens(apiMessages);

  const result = truncateContextForModel(
    apiMessages,
    input.modelMaxTokens,
    input.reserveTokens,
    0, // toolsCount — 输入未提供工具数，按 0 处理
  );

  const truncatedTokenCount = estimateMessagesTokens(result.messages);

  return {
    truncated: result.truncated,
    originalTokenCount,
    truncatedTokenCount,
    retainedMessages: result.messages.length,
  };
}

// ==================== 全局实例（便捷访问） ====================

/** 全局 Worker 池实例 */
let globalPool: CompactionWorkerPool | undefined;

/**
 * 获取/创建全局 Compaction Worker 池。
 *
 * @param options 池配置（仅在新建时生效）
 */
export function getCompactionWorkerPool(
  options?: CompactionWorkerPoolOptions,
): CompactionWorkerPool {
  if (!globalPool || globalPool.isDisposed()) {
    globalPool = new CompactionWorkerPool(options);
  }
  return globalPool;
}

/** 销毁全局 Compaction Worker 池 */
export function destroyCompactionWorkerPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = undefined;
  }
}

/**
 * 提交压缩任务到全局 Worker 池（便捷函数）。
 *
 * @param input 压缩任务输入
 * @returns 压缩结果
 */
export async function compactContext(
  input: CompactionWorkerInput,
): Promise<CompactionWorkerOutput> {
  return getCompactionWorkerPool().compact(input);
}

/** compactionWorker 模块导出聚合 */
export const compactionWorker = {
  CompactionWorkerPool,
  getCompactionWorkerPool,
  destroyCompactionWorkerPool,
  compactContext,
};
