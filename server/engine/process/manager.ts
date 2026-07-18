/**
 * 进程管理器（顶层编排）
 *
 * 封装 ProcessSupervisor + ProcessPool + 配置注入：
 * - 提供 start/stop/restart/list/get 简易 API
 * - 维护一个默认 supervisor 实例
 * - 支持按 name 创建/复用进程池
 */

import { logger } from '../../logger.js';
import { ProcessPool, type ProcessPoolConfig } from './pool.js';
import { ProcessSupervisor, type SupervisorDeps } from './supervisor.js';
import type { ManagedProcess, ProcessConfig, ProcessSnapshot, TerminationReason } from './types.js';

/** 管理器构造选项 */
export interface ProcessManagerOptions {
  /** 默认 Supervisor 依赖 */
  supervisorDeps?: SupervisorDeps;
}

/** 管理器内部跟踪的进程 */
interface TrackedProcess {
  id: string;
  name: string;
  config: ProcessConfig;
  supervisor: ProcessSupervisor;
  startedAtMs: number;
}

/**
 * 进程管理器
 *
 * 顶层入口：在多个 Supervisor 之间共享一个查询接口。
 * 支持简单的"按 name 查找"与"批量停止"。
 */
export class ProcessManager {
  private readonly defaultSupervisor: ProcessSupervisor;
  private readonly tracked = new Map<string, TrackedProcess>();
  private readonly byName = new Map<string, Set<string>>();
  private readonly pools = new Map<string, ProcessPool>();

  constructor(options?: ProcessManagerOptions) {
    this.defaultSupervisor = new ProcessSupervisor(options?.supervisorDeps);
  }

  /** 默认 Supervisor */
  getDefaultSupervisor(): ProcessSupervisor {
    return this.defaultSupervisor;
  }

  /**
   * 启动一个进程
   *
   * - 使用默认 Supervisor
   * - 跟踪 id 与 name
   */
  async start(config: ProcessConfig, id?: string): Promise<ManagedProcess> {
    const result = await this.defaultSupervisor.start(config, { id });
    this.track(result.process.id, config);
    return result.process;
  }

  /** 停止一个进程 */
  stop(id: string, reason: TerminationReason = 'manual-stop'): void {
    this.defaultSupervisor.stop(id, reason);
  }

  /** 重启一个进程 */
  async restart(id: string): Promise<ManagedProcess> {
    const result = await this.defaultSupervisor.restart(id);
    this.track(result.process.id, this.tracked.get(id)?.config ?? result.process.config);
    return result.process;
  }

  /** 获取一个进程 */
  get(id: string): ManagedProcess | undefined {
    return this.defaultSupervisor.get(id);
  }

  /** 按 name 获取所有进程（一次仅返回第一个） */
  getByName(name: string): ManagedProcess | undefined {
    const ids = this.byName.get(name);
    if (!ids || ids.size === 0) {
      return undefined;
    }
    const firstId = Array.from(ids)[0];
    return this.defaultSupervisor.get(firstId);
  }

  /** 列出所有进程 */
  list(): ProcessSnapshot[] {
    return this.defaultSupervisor.list();
  }

  /** 停止某个 name 的所有进程 */
  async stopAllByName(name: string, reason: TerminationReason = 'manual-stop'): Promise<void> {
    this.defaultSupervisor.cancelScope(name, reason);
    // 等待全部退出
    const ids = this.byName.get(name);
    if (!ids) {
      return;
    }
    await Promise.all(
      Array.from(ids).map(async (id) => {
        const p = this.defaultSupervisor.get(id);
        if (p) {
          try {
            await p.wait();
          } catch {
            // ignore
          }
        }
      }),
    );
  }

  /** 停止所有跟踪的进程 */
  async stopAll(reason: TerminationReason = 'manual-stop'): Promise<void> {
    const all = this.list();
    for (const snap of all) {
      this.defaultSupervisor.stop(snap.id, reason);
    }
    await Promise.all(
      all.map(async (snap) => {
        const p = this.defaultSupervisor.get(snap.id);
        if (p) {
          try {
            await p.wait();
          } catch {
            // ignore
          }
        }
      }),
    );
    for (const pool of this.pools.values()) {
      try {
        await pool.drain();
      } catch (err) {
        logger.warn(`[Process:Manager] pool drain failed: ${err}`);
      }
    }
    this.pools.clear();
  }

  /**
   * 创建或获取一个进程池
   *
   * - 同 name 复用现有池
   * - factory 调用 supervisor.start 启动新进程
   */
  getOrCreatePool(name: string, config: ProcessPoolConfig): ProcessPool {
    const existing = this.pools.get(name);
    if (existing) {
      return existing;
    }
    const factory = async (cfg: ProcessConfig) => {
      const result = await this.defaultSupervisor.start(cfg);
      this.track(result.process.id, cfg);
      return result.process;
    };
    const pool = new ProcessPool(config, factory);
    this.pools.set(name, pool);
    return pool;
  }

  /** 获取一个池（不存在返回 undefined） */
  getPool(name: string): ProcessPool | undefined {
    return this.pools.get(name);
  }

  /** 跟踪一个进程 */
  private track(id: string, config: ProcessConfig): void {
    const now = Date.now();
    this.tracked.set(id, {
      id,
      name: config.name,
      config,
      supervisor: this.defaultSupervisor,
      startedAtMs: now,
    });
    let set = this.byName.get(config.name);
    if (!set) {
      set = new Set();
      this.byName.set(config.name, set);
    }
    set.add(id);
  }
}

/** 进程管理器单例（可选使用） */
let singleton: ProcessManager | null = null;

/** 获取进程级单例 */
export function getProcessManager(): ProcessManager {
  if (singleton) {
    return singleton;
  }
  singleton = new ProcessManager();
  return singleton;
}

/** 重置单例（用于测试） */
export function resetProcessManagerSingleton(): void {
  singleton = null;
}
