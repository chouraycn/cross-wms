/**
 * 进程池
 *
 * 维护一组同模板的预热进程，提供 acquire/release/调度/回收。
 */

import { logger } from '../../logger.js';
import type { ManagedProcess, ProcessConfig, ProcessSnapshot } from './types.js';

/** 池条目 */
export interface PoolEntry {
  id: string;
  process: ManagedProcess;
  config: ProcessConfig;
  busy: boolean;
  createdAtMs: number;
  lastUsedAtMs: number;
}

/** 进程池配置 */
export interface ProcessPoolConfig {
  /** 模板配置 */
  template: ProcessConfig;
  /** 最小预热进程数 */
  minSize?: number;
  /** 最大进程数 */
  maxSize?: number;
  /** 空闲多久后回收（毫秒） */
  idleRecycleMs?: number;
  /** 等待槽位的超时（毫秒） */
  acquireTimeoutMs?: number;
}

const DEFAULT_MIN_SIZE = 1;
const DEFAULT_MAX_SIZE = 4;
const DEFAULT_IDLE_RECYCLE_MS = 60_000;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

/** 池的工厂函数：从模板创建一个进程 */
export type PoolFactory = (config: ProcessConfig) => Promise<ManagedProcess>;

/** 获取句柄结果 */
export interface AcquireResult {
  entry: PoolEntry;
  release: (recycle?: boolean) => void;
}

/**
 * 进程池
 *
 * 由调用方注入 factory（通常是 Supervisor.start）。
 * acquire() 返回一个空闲进程，使用完后 release()。
 */
export class ProcessPool {
  readonly config: Required<Omit<ProcessPoolConfig, 'template'>>;
  readonly template: ProcessConfig;
  private readonly entries = new Map<string, PoolEntry>();
  private readonly factory: PoolFactory;
  private readonly waiters: Array<{
    resolve: (r: AcquireResult) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout> | null;
  }> = [];
  private sequence = 0;
  private disposed = false;

  constructor(config: ProcessPoolConfig, factory: PoolFactory) {
    this.template = config.template;
    this.factory = factory;
    this.config = {
      minSize: config.minSize ?? DEFAULT_MIN_SIZE,
      maxSize: config.maxSize ?? DEFAULT_MAX_SIZE,
      idleRecycleMs: config.idleRecycleMs ?? DEFAULT_IDLE_RECYCLE_MS,
      acquireTimeoutMs: config.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
    };
  }

  /** 当前总进程数 */
  size(): number {
    return this.entries.size;
  }

  /** 空闲进程数 */
  idleCount(): number {
    let n = 0;
    for (const e of this.entries.values()) {
      if (!e.busy) n += 1;
    }
    return n;
  }

  /** 忙碌进程数 */
  busyCount(): number {
    let n = 0;
    for (const e of this.entries.values()) {
      if (e.busy) n += 1;
    }
    return n;
  }

  /** 预热：保证 minSize 个进程已存在 */
  async prewarm(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const needed = Math.max(0, this.config.minSize - this.entries.size);
    if (needed <= 0) {
      return;
    }
    await Promise.all(
      Array.from({ length: needed }, async () => {
        try {
          await this.spawn();
        } catch (err) {
          logger.warn(`[Process:Pool] prewarm failed: ${err}`);
        }
      }),
    );
  }

  /** 申请一个进程 */
  async acquire(): Promise<AcquireResult> {
    if (this.disposed) {
      throw new Error('ProcessPool is disposed');
    }
    const idle = this.findIdle();
    if (idle) {
      return this.checkout(idle);
    }
    if (this.entries.size < this.config.maxSize) {
      const entry = await this.spawn();
      return this.checkout(entry);
    }
    return await this.waitForSlot();
  }

  /** 主动释放一个进程（让池回收） */
  release(id: string, recycle = true): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    entry.busy = false;
    entry.lastUsedAtMs = Date.now();
    if (!recycle) {
      void this.evict(id);
    } else {
      this.pumpWaiters();
    }
  }

  /** 列出所有进程快照 */
  list(): ProcessSnapshot[] {
    return Array.from(this.entries.values()).map((e) => ({
      id: e.id,
      pid: e.process.pid,
      name: e.process.name,
      state: e.process.state,
      startedAtMs: e.process.startedAtMs,
      lastOutputAtMs: e.process.lastOutputAtMs,
      restartCount: 0,
      uptimeMs: Date.now() - e.process.startedAtMs,
    }));
  }

  /** 回收空闲时间过长的进程（保留 minSize） */
  recycleIdle(now: number = Date.now()): number {
    let recycled = 0;
    if (this.entries.size <= this.config.minSize) {
      return 0;
    }
    for (const [id, entry] of this.entries.entries()) {
      if (entry.busy) {
        continue;
      }
      if (now - entry.lastUsedAtMs >= this.config.idleRecycleMs) {
        void this.evict(id);
        recycled += 1;
        if (this.entries.size <= this.config.minSize) {
          break;
        }
      }
    }
    if (recycled > 0) {
      logger.debug(`[Process:Pool] recycled ${recycled} idle processes`);
    }
    return recycled;
  }

  /** 清空池：停止所有进程 */
  async drain(): Promise<void> {
    this.disposed = true;
    const entries = Array.from(this.entries.values());
    this.entries.clear();
    for (const w of this.waiters) {
      if (w.timer) {
        clearTimeout(w.timer);
      }
      w.reject(new Error('ProcessPool drained'));
    }
    this.waiters.length = 0;
    for (const e of entries) {
      try {
        e.process.stop('manual-stop');
        await e.process.wait();
      } catch (err) {
        logger.debug(`[Process:Pool] drain stop failed for ${e.id}: ${err}`);
      }
    }
  }

  /** 内部：spawn 一个新进程 */
  private async spawn(): Promise<PoolEntry> {
    if (this.disposed) {
      throw new Error('ProcessPool is disposed');
    }
    const id = `pool-${this.sequence++}`;
    const process = await this.factory({ ...this.template });
    const now = Date.now();
    const entry: PoolEntry = {
      id,
      process,
      config: { ...this.template },
      busy: false,
      createdAtMs: now,
      lastUsedAtMs: now,
    };
    this.entries.set(id, entry);
    return entry;
  }

  private findIdle(): PoolEntry | undefined {
    for (const e of this.entries.values()) {
      if (!e.busy) {
        return e;
      }
    }
    return undefined;
  }

  private checkout(entry: PoolEntry): AcquireResult {
    entry.busy = true;
    entry.lastUsedAtMs = Date.now();
    return {
      entry,
      release: (recycle = true) => this.release(entry.id, recycle),
    };
  }

  private waitForSlot(): Promise<AcquireResult> {
    return new Promise<AcquireResult>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: null as ReturnType<typeof setTimeout> | null,
      };
      waiter.timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) {
          this.waiters.splice(idx, 1);
        }
        reject(new Error('ProcessPool acquire timed out'));
      }, this.config.acquireTimeoutMs);
      this.waiters.push(waiter);
    });
  }

  private pumpWaiters(): void {
    if (this.waiters.length === 0) {
      return;
    }
    const idle = this.findIdle();
    if (!idle) {
      return;
    }
    const waiter = this.waiters.shift() as { resolve: (r: AcquireResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> | null };
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }
    waiter.resolve(this.checkout(idle));
  }

  private async evict(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    this.entries.delete(id);
    try {
      entry.process.stop('manual-stop');
      await entry.process.wait();
    } catch (err) {
      logger.debug(`[Process:Pool] evict stop failed for ${id}: ${err}`);
    }
  }
}
