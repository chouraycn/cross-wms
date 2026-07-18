/**
 * 生命周期管理
 *
 * 维护进程状态机、事件历史，提供僵尸进程清理。
 */

import { logger } from '../../logger.js';
import type {
  ProcessEvent,
  ProcessEventListener,
  ProcessExitInfo,
  ProcessState,
  TerminationReason,
} from './types.js';

/** 状态变更记录 */
export interface StateChangeRecord {
  processId: string;
  from: ProcessState;
  to: ProcessState;
  reason?: string;
  timestamp: number;
}

/** 合法的状态转移表 */
const VALID_TRANSITIONS: Record<ProcessState, ProcessState[]> = {
  pending: ['starting', 'exited'],
  starting: ['running', 'crashed', 'exited', 'zombie'],
  running: ['stopping', 'crashed', 'exited', 'zombie'],
  stopping: ['exited', 'crashed', 'zombie'],
  crashed: ['starting', 'exited', 'zombie'],
  exited: [],
  zombie: ['exited', 'running'],
};

/** 单个进程的运行时记录 */
export interface ProcessRuntimeRecord {
  id: string;
  name: string;
  state: ProcessState;
  pid?: number;
  startedAtMs: number;
  lastOutputAtMs: number;
  endedAtMs?: number;
  exit?: ProcessExitInfo;
  restartCount: number;
  history: StateChangeRecord[];
  /** 标记为僵尸的时间（用于清理判定） */
  zombieSinceMs?: number;
}

/** 僵尸清理策略配置 */
export interface ZombieCleanupConfig {
  /** 标记为僵尸后多久才允许清理（毫秒） */
  graceMs?: number;
  /** 自动清理的轮询间隔 */
  intervalMs?: number;
  /** 时间源（用于测试） */
  now?: () => number;
  /** 调度器（用于测试） */
  scheduler?: typeof setInterval;
  clearer?: typeof clearInterval;
}

const DEFAULT_ZOMBIE_GRACE_MS = 5_000;
const DEFAULT_ZOMBIE_INTERVAL_MS = 60_000;

/**
 * 生命周期管理器
 *
 * 全进程注册表：维护所有受管理进程的当前状态与历史。
 * 同时支持僵尸清理：标记为 zombie 的进程在 grace 后被回收。
 */
export class LifecycleManager {
  private readonly records = new Map<string, ProcessRuntimeRecord>();
  private readonly listeners = new Set<ProcessEventListener>();
  private readonly zombieConfig: Required<ZombieCleanupConfig>;
  private zombieTimer: ReturnType<typeof setInterval> | null = null;

  constructor(zombieConfig?: ZombieCleanupConfig) {
    this.zombieConfig = {
      graceMs: zombieConfig?.graceMs ?? DEFAULT_ZOMBIE_GRACE_MS,
      intervalMs: zombieConfig?.intervalMs ?? DEFAULT_ZOMBIE_INTERVAL_MS,
      now: zombieConfig?.now ?? (() => Date.now()),
      scheduler: zombieConfig?.scheduler ?? setInterval,
      clearer: zombieConfig?.clearer ?? clearInterval,
    };
  }

  /** 注册一个进程 */
  register(id: string, name: string, now: number = this.zombieConfig.now()): ProcessRuntimeRecord {
    const record: ProcessRuntimeRecord = {
      id,
      name,
      state: 'pending',
      startedAtMs: now,
      lastOutputAtMs: now,
      restartCount: 0,
      history: [],
    };
    this.records.set(id, record);
    return record;
  }

  /** 获取记录（不存在返回 undefined） */
  get(id: string): ProcessRuntimeRecord | undefined {
    return this.records.get(id);
  }

  /** 判断状态转移是否合法 */
  canTransition(from: ProcessState, to: ProcessState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /** 状态转移：成功返回 true，非法返回 false */
  setState(id: string, next: ProcessState, reason?: string, now: number = this.zombieConfig.now()): boolean {
    const record = this.records.get(id);
    if (!record) {
      return false;
    }
    const from = record.state;
    if (from === next) {
      return true;
    }
    if (!this.canTransition(from, next)) {
      logger.warn(`[Process:Lifecycle] invalid transition ${id}: ${from} -> ${next}`);
      return false;
    }
    record.state = next;
    record.history.push({ processId: id, from, to: next, reason, timestamp: now });
    if (next === 'zombie') {
      record.zombieSinceMs = now;
    } else if (next === 'exited') {
      record.endedAtMs = now;
    }
    this.emit({ type: 'state-change', processId: id, from, to: next, reason, timestamp: now });
    return true;
  }

  /** 设置 pid（在 spawn 成功后） */
  setPid(id: string, pid: number): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    record.pid = pid;
  }

  /** 标记一次输出 */
  touchOutput(id: string, now: number = this.zombieConfig.now()): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    record.lastOutputAtMs = now;
  }

  /** 标记退出 */
  finalize(id: string, exit: ProcessExitInfo, now: number = this.zombieConfig.now()): boolean {
    const record = this.records.get(id);
    if (!record) {
      return false;
    }
    record.exit = exit;
    record.endedAtMs = now;
    if (record.state !== 'exited' && record.state !== 'zombie') {
      const targetState: ProcessState = exit.reason === 'crash' || exit.reason === 'signal' ? 'crashed' : 'exited';
      this.setState(id, targetState, exit.reason, now);
    }
    this.emit({ type: 'exit', processId: id, exit, timestamp: now });
    return true;
  }

  /** 增加重启计数 */
  incrementRestart(id: string): number {
    const record = this.records.get(id);
    if (!record) {
      return 0;
    }
    record.restartCount += 1;
    return record.restartCount;
  }

  /** 标记为僵尸（等待清理） */
  markZombie(id: string, reason?: string, now: number = this.zombieConfig.now()): boolean {
    return this.setState(id, 'zombie', reason, now);
  }

  /** 标记活跃：将僵尸状态恢复到 running */
  reviveZombie(id: string, now: number = this.zombieConfig.now()): boolean {
    const record = this.records.get(id);
    if (!record || record.state !== 'zombie') {
      return false;
    }
    return this.setState(id, 'running', 'revived', now);
  }

  /** 启动僵尸自动清理 */
  startZombieCleanup(): void {
    if (this.zombieTimer) {
      return;
    }
    this.zombieTimer = this.zombieConfig.scheduler(() => {
      void this.cleanupZombies();
    }, this.zombieConfig.intervalMs);
  }

  /** 停止僵尸自动清理 */
  stopZombieCleanup(): void {
    if (this.zombieTimer) {
      this.zombieConfig.clearer(this.zombieTimer);
      this.zombieTimer = null;
    }
  }

  /**
   * 执行一次僵尸清理
   *
   * @param cleanupFn 实际清理函数（通常是 kill -9 + dispose adapter）
   * @returns 被清理的 id 列表
   */
  cleanupZombies(
    cleanupFn?: (id: string) => void,
    now: number = this.zombieConfig.now(),
  ): string[] {
    const cleaned: string[] = [];
    for (const [id, record] of this.records.entries()) {
      if (record.state !== 'zombie') {
        continue;
      }
      const since = record.zombieSinceMs ?? record.endedAtMs ?? now;
      if (now - since < this.zombieConfig.graceMs) {
        continue;
      }
      try {
        cleanupFn?.(id);
      } catch (err) {
        logger.warn(`[Process:Lifecycle] zombie cleanup failed for ${id}: ${err}`);
      }
      this.setState(id, 'exited', 'zombie-cleanup', now);
      cleaned.push(id);
    }
    if (cleaned.length > 0) {
      logger.debug(`[Process:Lifecycle] cleaned ${cleaned.length} zombies`);
    }
    return cleaned;
  }

  /** 列出所有进程的当前状态 */
  list(): ProcessRuntimeRecord[] {
    return Array.from(this.records.values());
  }

  /** 列出活跃进程（starting/running/stopping） */
  listActive(): ProcessRuntimeRecord[] {
    return this.list().filter((r) => this.isActiveState(r.state));
  }

  /** 监听事件 */
  addListener(listener: ProcessEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 移除一个进程的记录（彻底删除） */
  remove(id: string): boolean {
    return this.records.delete(id);
  }

  /** 清空所有记录 */
  clear(): void {
    this.records.clear();
  }

  /** 判断状态是否为终态 */
  isTerminalState(state: ProcessState): boolean {
    return state === 'exited' || state === 'crashed';
  }

  /** 判断状态是否为活跃 */
  isActiveState(state: ProcessState): boolean {
    return state === 'starting' || state === 'running' || state === 'stopping';
  }

  private emit(event: ProcessEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        logger.debug(`[Process:Lifecycle] listener threw: ${err}`);
      }
    }
  }
}

/** 终止原因辅助：从退出信息推导 */
export function deriveReasonFromExit(exit: {
  code: number | null;
  signal: NodeJS.Signals | null;
}): TerminationReason {
  if (exit.signal) {
    return 'signal';
  }
  if (exit.code === 0 || exit.code === null) {
    return 'exit';
  }
  return 'crash';
}
