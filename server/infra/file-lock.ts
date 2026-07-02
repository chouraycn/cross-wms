/**
 * 文件锁模块 — 基于锁文件的跨进程排他锁实现
 *
 * 参考自 OpenClaw 的 infra/file-lock.ts 设计。
 *
 * 实现要点：
 * - 通过在目标文件路径追加 `.lock` 后缀创建独立的锁文件
 * - 使用 `O_EXCL` 标志确保锁文件创建的原子性（互斥）
 * - 支持陈旧锁检测：锁文件 mtime 超过阈值视为陈旧，自动清理
 * - 支持获取超时：在指定时间内轮询重试获取锁
 *
 * 适用场景：
 * - 跨进程互斥访问共享资源（如 SQLite 写入、文件写入）
 * - 防止并发任务重复执行
 */

import { open, stat, unlink } from 'fs/promises';

// ===================== 常量配置 =====================

/** 默认获取锁超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 5000;
/** 轮询重试间隔（毫秒） */
const POLL_INTERVAL_MS = 100;
/** 锁文件被视为陈旧的阈值（毫秒），超过则自动清理 */
const STALE_THRESHOLD_MS = 30000;

// ===================== 类型定义 =====================

/**
 * 文件锁句柄，持有者通过 release() 释放锁。
 */
export interface FileLockHandle {
  /** 释放锁（删除锁文件）。多次调用安全，不会抛错。 */
  release: () => Promise<void>;
}

/**
 * 获取文件锁超时错误。
 */
export class FileLockTimeoutError extends Error {
  /** 锁文件路径 */
  readonly lockPath: string;
  /** 等待的超时时长（毫秒） */
  readonly timeoutMs: number;

  constructor(lockPath: string, timeoutMs: number) {
    super(`获取文件锁超时: ${lockPath} (${timeoutMs}ms)`);
    this.name = 'FileLockTimeoutError';
    this.lockPath = lockPath;
    this.timeoutMs = timeoutMs;
  }
}

// ===================== 内部工具函数 =====================

/**
 * 根据目标文件路径生成对应的锁文件路径。
 */
function getLockPath(filePath: string): string {
  return `${filePath}.lock`;
}

/**
 * 获取当前时间戳（毫秒）。
 */
function nowMs(): number {
  return Date.now();
}

/**
 * 休眠指定毫秒数。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 尝试原子性地创建锁文件（O_EXCL 保证互斥）。
 * 创建成功返回 true，若锁文件已存在返回 false。
 */
async function tryCreateLockFile(lockPath: string): Promise<boolean> {
  try {
    // O_EXCL: 若文件已存在则失败，保证创建的原子性与互斥性
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(String(process.pid));
    await handle.close();
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      return false;
    }
    // 其他错误（如权限不足）向上抛出
    throw err;
  }
}

/**
 * 检测锁文件是否陈旧（mtime 超过阈值）。
 * 陈旧则尝试清理并返回 true，否则返回 false。
 */
async function detectAndCleanStaleLock(
  lockPath: string,
  staleThresholdMs: number = STALE_THRESHOLD_MS
): Promise<boolean> {
  try {
    const stats = await stat(lockPath);
    const ageMs = nowMs() - stats.mtimeMs;
    if (ageMs > staleThresholdMs) {
      // 视为陈旧锁，清理之
      await unlink(lockPath).catch(() => {
        /* 忽略清理失败（可能已被其他进程清理） */
      });
      return true;
    }
    return false;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // 锁文件已不存在，视为已可获取
      return true;
    }
    // 其他错误不视为陈旧，返回 false
    return false;
  }
}

// ===================== 核心导出函数 =====================

/**
 * 获取指定文件路径的排他锁。
 *
 * 行为：
 * - 在 `filePath` 同级目录创建 `filePath.lock` 锁文件
 * - 若锁已被占用，则在 `timeoutMs` 内每 `POLL_INTERVAL_MS` 轮询重试
 * - 检测到陈旧锁（mtime 超过 30 秒）时自动清理并接管
 * - 超时未获取到锁则抛出 `FileLockTimeoutError`
 *
 * @param filePath 需要加锁的目标文件路径
 * @param timeoutMs 获取锁的超时时间（毫秒），默认 5000
 * @returns 锁句柄，需在完成后调用 release() 释放
 */
export async function acquireFileLock(
  filePath: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<FileLockHandle> {
  const lockPath = getLockPath(filePath);
  const deadline = nowMs() + timeoutMs;
  let released = false;

  // 首次尝试，后续按需轮询
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // 尝试创建锁文件
    if (await tryCreateLockFile(lockPath)) {
      // 成功获取锁
      const release = async (): Promise<void> => {
        if (released) return;
        released = true;
        await unlink(lockPath).catch(() => {
          /* 忽略删除失败（可能已被陈旧检测清理） */
        });
      };
      return { release };
    }

    // 锁已被占用，检测是否陈旧
    const cleaned = await detectAndCleanStaleLock(lockPath);
    if (cleaned) {
      // 陈旧锁已清理，立即重试获取
      continue;
    }

    // 未超时则等待后重试
    if (nowMs() >= deadline) {
      throw new FileLockTimeoutError(lockPath, timeoutMs);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * 在文件锁保护下执行函数，确保执行完毕后锁一定被释放。
 *
 * 流程：获取锁 → 执行 fn → 释放锁（在 finally 块中）
 * 即使 fn 抛出异常，锁也会被正确释放。
 *
 * @param filePath 需要加锁的目标文件路径
 * @param fn 受锁保护的异步函数
 * @param timeoutMs 获取锁的超时时间（毫秒），默认 5000
 * @returns fn 的返回值
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const handle = await acquireFileLock(filePath, timeoutMs);
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}
