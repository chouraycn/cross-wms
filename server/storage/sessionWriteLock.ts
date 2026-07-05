/**
 * SessionWriteLock — 跨进程会话文件写锁
 *
 * 参照 openclaw session-write-lock.ts 设计，为 cross-wms 提供跨进程
 * 写入串行化能力。支持多进程架构下的安全并发写入。
 *
 * 核心机制：
 * 1. 锁文件：${sessionFile}.lock，包含 {pid, createdAt, starttime, maxHoldMs}
 * 2. PID 存活检测：process.kill(pid, 0)
 * 3. PID 回收检测：比较进程启动时间（macOS: ps -p <pid> -o lstart）
 * 4. 孤儿锁宽限期：30 秒（短超时 5 秒）
 * 5. watchdog：每 60 秒扫描所有锁文件，清理超时锁
 * 6. 信号清理：SIGINT/SIGTERM 时释放所有持有的锁
 *
 * 用法：
 *   const release = await acquireSessionWriteLock(sessionId);
 *   try {
 *     // 临界区：安全写入
 *   } finally {
 *     await release();
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

interface LockFilePayload {
  pid: number;
  createdAt: string;
  /** 进程启动时间（ISO 字符串，用于 PID 回收检测） */
  starttime: string;
  maxHoldMs: number;
}

interface LockInspection {
  lockPath: string;
  pid: number | null;
  pidAlive: boolean;
  createdAt: string | null;
  ageMs: number | null;
  stale: boolean;
  staleReasons: string[];
}

export type SessionLockRelease = () => Promise<void>;
export type SessionLockReleaseSync = () => void;

// ===================== 常量 =====================

const DEFAULT_STALE_MS = 30 * 60 * 1000; // 30 分钟
const DEFAULT_MAX_HOLD_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_ACQUIRE_TIMEOUT_MS = 60_000; // 60 秒
const DEFAULT_WATCHDOG_INTERVAL_MS = 60_000; // 60 秒
const ORPHAN_LOCK_GRACE_MS = 30_000; // 30 秒
const SHORT_TIMEOUT_ORPHAN_GRACE_MS = 5_000;
const ACQUIRE_RETRY_INTERVAL_MS = 100; // 100ms
const CLEANUP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const;

// ===================== 状态 =====================

/** 当前进程持有的锁路径集合 */
const heldLocks = new Set<string>();
/** 信号清理已注册标记 */
let cleanupRegistered = false;
/** watchdog 定时器 */
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

// ===================== 工具函数 =====================

/** 获取锁文件路径 */
function getLockPath(sessionId: string): string {
  return path.join(AppPaths.sessionsDir, `${sessionId}.jsonl.lock`);
}

/** 获取会话文件路径 */
function getSessionFilePath(sessionId: string): string {
  return path.join(AppPaths.sessionsDir, `${sessionId}.jsonl`);
}

/** 检查 PID 是否存活 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取进程启动时间（用于 PID 回收检测）
 * macOS: ps -p <pid> -o lstart
 * Linux: /proc/<pid>/stat 字段 22
 */
function getProcessStartTime(pid: number): string | null {
  try {
    if (process.platform === 'darwin') {
      const output = execSync(`ps -p ${pid} -o lstart=`, {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      return output;
    } else if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
      const fields = stat.split(' ');
      // 字段 22 是 starttime（clock ticks）
      const starttime = fields[21];
      if (starttime) {
        // 转换为秒（假设 100Hz）
        return `${Math.floor(parseInt(starttime, 10) / 100)}s`;
      }
      return null;
    }
  } catch {
    // 进程不存在或无权限
  }
  return null;
}

/** 获取当前进程的启动时间 */
function getCurrentProcessStartTime(): string {
  return getProcessStartTime(process.pid) || new Date().toISOString();
}

/** 读取锁文件内容 */
function readLockFile(lockPath: string): LockFilePayload | null {
  try {
    const content = fs.readFileSync(lockPath, 'utf-8');
    const payload = JSON.parse(content) as LockFilePayload;
    if (
      typeof payload.pid === 'number' &&
      typeof payload.createdAt === 'string' &&
      typeof payload.starttime === 'string' &&
      typeof payload.maxHoldMs === 'number'
    ) {
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

/** 检查锁是否过期 */
function inspectLock(
  lockPath: string,
  payload: LockFilePayload | null,
  staleMs: number,
  nowMs: number,
  opts: { respectMaxHold?: boolean } = {},
): LockInspection {
  const pid = payload?.pid && payload.pid > 0 ? payload.pid : null;
  const pidAlive = pid !== null ? isPidAlive(pid) : false;
  const createdAt = payload?.createdAt || null;
  const createdAtMs = createdAt ? Date.parse(createdAt) : NaN;
  const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, nowMs - createdAtMs) : null;

  // PID 回收检测
  const storedStarttime = payload?.starttime || null;
  const pidRecycled =
    pidAlive && pid !== null && storedStarttime !== null
      ? (() => {
          const currentStarttime = getProcessStartTime(pid);
          return currentStarttime !== null && currentStarttime !== storedStarttime;
        })()
      : false;

  const staleReasons: string[] = [];
  if (pid === null) {
    staleReasons.push('missing-pid');
  } else if (!pidAlive) {
    staleReasons.push('dead-pid');
  } else if (pidRecycled) {
    staleReasons.push('recycled-pid');
  }
  if (ageMs === null) {
    staleReasons.push('invalid-createdAt');
  } else if (ageMs > staleMs) {
    staleReasons.push('too-old');
  }
  if (
    opts.respectMaxHold === true &&
    payload?.maxHoldMs &&
    payload.maxHoldMs > 0 &&
    ageMs !== null &&
    ageMs > payload.maxHoldMs
  ) {
    staleReasons.push('hold-exceeded');
  }

  return {
    lockPath,
    pid,
    pidAlive,
    createdAt,
    ageMs,
    stale: staleReasons.length > 0,
    staleReasons,
  };
}

/** 尝试原子创建锁文件（O_EXCL） */
function tryCreateLockFile(lockPath: string, payload: LockFilePayload): boolean {
  try {
    // 使用 'wx' flag（O_CREAT | O_EXCL），原子创建，已存在则失败
    const fd = fs.openSync(lockPath, 'wx');
    try {
      fs.writeSync(fd, JSON.stringify(payload), 0, 'utf-8');
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (e: any) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

/** 删除锁文件（如果属于当前进程） */
function removeLockFile(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // 已被删除或其他进程删除
  }
}

// ===================== 信号清理 =====================

function registerSignalCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    for (const lockPath of heldLocks) {
      removeLockFile(lockPath);
    }
    heldLocks.clear();
  };

  for (const sig of CLEANUP_SIGNALS) {
    process.on(sig, cleanup);
  }
  process.on('exit', cleanup);
}

// ===================== 核心 API =====================

/**
 * 获取会话写锁
 * @param sessionId 会话 ID
 * @param options 选项
 * @returns release 函数（必须在 finally 中调用）
 */
export async function acquireSessionWriteLock(
  sessionId: string,
  options: {
    timeoutMs?: number;
    staleMs?: number;
    maxHoldMs?: number;
  } = {},
): Promise<SessionLockRelease> {
  const lockPath = getLockPath(sessionId);
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const maxHoldMs = options.maxHoldMs ?? DEFAULT_MAX_HOLD_MS;
  const deadline = Date.now() + timeoutMs;
  const orphanGrace = timeoutMs < 10_000 ? SHORT_TIMEOUT_ORPHAN_GRACE_MS : ORPHAN_LOCK_GRACE_MS;

  registerSignalCleanup();

  while (true) {
    // 尝试创建锁文件
    const payload: LockFilePayload = {
      pid: process.pid,
      createdAt: new Date().toISOString(),
      starttime: getCurrentProcessStartTime(),
      maxHoldMs,
    };

    if (tryCreateLockFile(lockPath, payload)) {
      heldLocks.add(lockPath);
      logger.debug(`[SessionWriteLock] 获取锁: ${sessionId} (pid=${process.pid})`);
      return async () => {
        removeLockFile(lockPath);
        heldLocks.delete(lockPath);
      };
    }

    // 锁文件已存在，检查是否过期
    const existingPayload = readLockFile(lockPath);
    const nowMs = Date.now();
    const inspection = inspectLock(lockPath, existingPayload, staleMs, nowMs, {
      respectMaxHold: true,
    });

    if (inspection.stale) {
      // 孤儿锁宽限期：如果锁文件无 payload 或创建时间在宽限期内，等待
      if (!existingPayload) {
        // 无 payload（锁文件刚创建但还没写入内容）
        const stat = fs.statSync(lockPath);
        const fileAge = nowMs - stat.mtimeMs;
        if (fileAge < orphanGrace) {
          // 还在宽限期内，等待
          if (Date.now() >= deadline) {
            throw new Error(
              `[SessionWriteLock] 获取锁超时 (${timeoutMs}ms): ${sessionId} (orphan lock in grace)`,
            );
          }
          await sleep(ACQUIRE_RETRY_INTERVAL_MS);
          continue;
        }
      }

      // 过期锁，尝试删除并重新获取
      logger.warn(
        `[SessionWriteLock] 清理过期锁: ${sessionId}, reasons=[${inspection.staleReasons.join(',')}], ` +
        `pid=${inspection.pid}, age=${inspection.ageMs}ms`,
      );
      removeLockFile(lockPath);
      continue;
    }

    // 锁仍被持有，检查是否超时
    if (Date.now() >= deadline) {
      throw new Error(
        `[SessionWriteLock] 获取锁超时 (${timeoutMs}ms): ${sessionId} ` +
        `(holder pid=${inspection.pid}, age=${inspection.ageMs}ms)`,
      );
    }

    await sleep(ACQUIRE_RETRY_INTERVAL_MS);
  }
}

/**
 * 同步获取会话写锁（用于不能 await 的场景）
 * 注意：同步等待会阻塞事件循环，仅用于短超时场景
 */
export function acquireSessionWriteLockSync(
  sessionId: string,
  options: {
    timeoutMs?: number;
    staleMs?: number;
    maxHoldMs?: number;
  } = {},
): SessionLockReleaseSync {
  const lockPath = getLockPath(sessionId);
  const timeoutMs = options.timeoutMs ?? 5000; // 同步默认 5 秒
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const maxHoldMs = options.maxHoldMs ?? DEFAULT_MAX_HOLD_MS;
  const deadline = Date.now() + timeoutMs;
  const orphanGrace = timeoutMs < 10_000 ? SHORT_TIMEOUT_ORPHAN_GRACE_MS : ORPHAN_LOCK_GRACE_MS;

  registerSignalCleanup();

  while (true) {
    const payload: LockFilePayload = {
      pid: process.pid,
      createdAt: new Date().toISOString(),
      starttime: getCurrentProcessStartTime(),
      maxHoldMs,
    };

    if (tryCreateLockFile(lockPath, payload)) {
      heldLocks.add(lockPath);
      return () => {
        removeLockFile(lockPath);
        heldLocks.delete(lockPath);
      };
    }

    const existingPayload = readLockFile(lockPath);
    const nowMs = Date.now();
    const inspection = inspectLock(lockPath, existingPayload, staleMs, nowMs, {
      respectMaxHold: true,
    });

    if (inspection.stale) {
      if (!existingPayload) {
        const stat = fs.statSync(lockPath);
        const fileAge = nowMs - stat.mtimeMs;
        if (fileAge < orphanGrace) {
          if (Date.now() >= deadline) {
            throw new Error(`[SessionWriteLock] 获取锁超时: ${sessionId} (orphan in grace)`);
          }
          sleepSync(ACQUIRE_RETRY_INTERVAL_MS);
          continue;
        }
      }
      logger.warn(
        `[SessionWriteLock] 清理过期锁(sync): ${sessionId}, reasons=[${inspection.staleReasons.join(',')}]`,
      );
      removeLockFile(lockPath);
      continue;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `[SessionWriteLock] 获取锁超时(sync): ${sessionId} (pid=${inspection.pid})`,
      );
    }

    sleepSync(ACQUIRE_RETRY_INTERVAL_MS);
  }
}

/**
 * 检查指定会话是否被锁定（不获取锁）
 */
export function isSessionLocked(sessionId: string): boolean {
  const lockPath = getLockPath(sessionId);
  const payload = readLockFile(lockPath);
  if (!payload) return false;
  const inspection = inspectLock(lockPath, payload, DEFAULT_STALE_MS, Date.now());
  return !inspection.stale;
}

/**
 * 获取锁状态信息（用于调试/监控）
 */
export function inspectSessionLock(sessionId: string): LockInspection | null {
  const lockPath = getLockPath(sessionId);
  const payload = readLockFile(lockPath);
  if (!payload) return null;
  return inspectLock(lockPath, payload, DEFAULT_STALE_MS, Date.now(), {
    respectMaxHold: true,
  });
}

// ===================== Watchdog =====================

/**
 * 启动 watchdog：定期扫描所有锁文件，清理过期的
 */
export function startWatchdog(intervalMs: number = DEFAULT_WATCHDOG_INTERVAL_MS): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    try {
      const dir = AppPaths.sessionsDir;
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl.lock'));
      let cleaned = 0;
      for (const f of files) {
        const lockPath = path.join(dir, f);
        const payload = readLockFile(lockPath);
        const inspection = inspectLock(lockPath, payload, DEFAULT_STALE_MS, Date.now(), {
          respectMaxHold: true,
        });
        if (inspection.stale && !heldLocks.has(lockPath)) {
          removeLockFile(lockPath);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        logger.info(`[SessionWriteLock] watchdog 清理了 ${cleaned} 个过期锁`);
      }
    } catch (e) {
      logger.warn('[SessionWriteLock] watchdog 扫描失败:', e);
    }
  }, intervalMs);
}

/** 停止 watchdog */
export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

/** 清理所有当前进程持有的锁（用于关闭时） */
export function releaseAllHeldLocks(): void {
  for (const lockPath of heldLocks) {
    removeLockFile(lockPath);
  }
  heldLocks.clear();
}

// ===================== 辅助 =====================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms: number): void {
  // 同步 sleep：使用 Atomics.wait（不阻塞事件循环外的线程）
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
}
