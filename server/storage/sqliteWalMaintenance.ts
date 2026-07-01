/**
 * SQLite WAL 维护和 PRAGMA 统一配置
 *
 * 参考 OpenClaw sqlite-wal.ts 实现
 * - 统一 WAL checkpoint 策略
 * - 统一 PRAGMA 配置（synchronous, busy_timeout, foreign_keys, cache_size, mmap_size）
 * - 定时 PASSIVE checkpoint + unref() 不阻塞进程退出
 * - 关闭时清理定时器 + 执行最终 TRUNCATE checkpoint
 */

import type Database from 'better-sqlite3';
import { logger } from '../logger.js';
import { TimerManager } from '../core/timerManager.js';

// ===================== 默认配置 =====================

/** WAL 自动 checkpoint 页数 */
export const DEFAULT_WAL_AUTOCHECKPOINT_PAGES = 1000;

/** 定期 checkpoint 间隔（30 分钟，与 OpenClaw 一致） */
export const DEFAULT_WAL_CHECKPOINT_INTERVAL_MS = 30 * 60 * 1000;

/** 默认 busy_timeout（30 秒） */
export const DEFAULT_BUSY_TIMEOUT_MS = 30_000;

/** 默认页面缓存大小（负数表示 KB） */
export const DEFAULT_CACHE_SIZE_KB = 4000; // 4MB

/** 默认 mmap 大小（64MB，让 OS 管理页面缓存减少 RSS） */
export const DEFAULT_MMAP_SIZE = 64 * 1024 * 1024;

// ===================== Profile 配置 =====================

/** 数据库规模 profile */
export type SqliteDatabaseProfile = 'large' | 'small' | 'default';

/** 大库 profile：适用于 >100MB 的数据库（如 chat.db） */
const PROFILE_LARGE = { cacheSizeKB: 8000, mmapSize: 32 * 1024 * 1024 } as const; // 8MB / 32MB

/** 小库 profile：适用于 <50MB 的数据库（如 vec_memory.db） */
const PROFILE_SMALL = { cacheSizeKB: 512, mmapSize: 8 * 1024 * 1024 } as const; // 512KB / 8MB

/** 默认 profile：通用数据库 */
const PROFILE_DEFAULT = { cacheSizeKB: 4000, mmapSize: 64 * 1024 * 1024 } as const; // 4MB / 64MB

function getProfileConfig(profile: SqliteDatabaseProfile) {
  switch (profile) {
    case 'large': return PROFILE_LARGE;
    case 'small': return PROFILE_SMALL;
    default: return PROFILE_DEFAULT;
  }
}

// ===================== 类型定义 =====================

export interface SqliteWalMaintenanceOptions {
  /** WAL 自动 checkpoint 页数 */
  autoCheckpointPages?: number;
  /** 定期 checkpoint 间隔（毫秒） */
  checkpointIntervalMs?: number;
  /** checkpoint 模式 */
  checkpointMode?: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE';
  /** 数据库标签（用于日志） */
  databaseLabel?: string;
}

export interface SqlitePragmaOptions extends SqliteWalMaintenanceOptions {
  /** 数据库规模 profile，自动设定 cache_size / mmap_size（可被显式参数覆盖） */
  profile?: SqliteDatabaseProfile;
  /** busy_timeout（毫秒） */
  busyTimeoutMs?: number;
  /** 是否启用外键约束 */
  foreignKeys?: boolean;
  /** synchronous 模式 */
  synchronous?: 'NORMAL' | 'FULL';
  /** 页面缓存大小（KB，负数）；不传则按 profile 取默认值 */
  cacheSizeKB?: number;
  /** mmap 大小（字节，0 = 禁用）；不传则按 profile 取默认值 */
  mmapSize?: number;
}

export interface SqliteWalMaintenance {
  /** 手动触发 checkpoint */
  checkpoint: () => boolean;
  /** 关闭维护（清理定时器 + 最终 checkpoint） */
  close: () => boolean;
}

// ===================== WAL 维护 =====================

/**
 * 配置 SQLite WAL 维护（checkpoint 策略 + 定时器）
 */
export function configureSqliteWalMaintenance(
  db: Database.Database,
  options: SqliteWalMaintenanceOptions = {},
): SqliteWalMaintenance {
  const autoCheckpointPages = options.autoCheckpointPages ?? DEFAULT_WAL_AUTOCHECKPOINT_PAGES;
  const checkpointIntervalMs = options.checkpointIntervalMs ?? DEFAULT_WAL_CHECKPOINT_INTERVAL_MS;
  const checkpointMode = options.checkpointMode ?? 'TRUNCATE';
  const periodicCheckpointMode = options.checkpointMode ?? 'PASSIVE';
  const label = options.databaseLabel ?? 'sqlite';

  // 设置 WAL 自动 checkpoint
  db.pragma(`journal_mode = WAL`);
  db.pragma(`wal_autocheckpoint = ${autoCheckpointPages}`);

  const runCheckpoint = (mode: string): boolean => {
    try {
      db.pragma(`wal_checkpoint(${mode})`);
      return true;
    } catch (error) {
      logger.warn(`[SQLite/WAL] ${label} checkpoint(${mode}) 失败:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  };

  const checkpoint = (): boolean => runCheckpoint(checkpointMode);

  // 启动定期 checkpoint 定时器
  const timerName = `${label}-wal-checkpoint`;
  if (checkpointIntervalMs > 0) {
    TimerManager.register({
      name: timerName,
      intervalMs: checkpointIntervalMs,
      callback: () => { runCheckpoint(periodicCheckpointMode); },
      unref: true,
    });
  }

  return {
    checkpoint,
    close: (): boolean => {
      if (checkpointIntervalMs > 0) {
        TimerManager.unregister(timerName);
      }
      return checkpoint();
    },
  };
}

/**
 * 配置 SQLite 连接的 PRAGMA（统一入口）
 *
 * 包括：WAL 模式、busy_timeout、synchronous、foreign_keys、cache_size、mmap_size
 */
export function configureSqliteConnectionPragmas(
  db: Database.Database,
  options: SqlitePragmaOptions = {},
): SqliteWalMaintenance {
  const { profile, busyTimeoutMs, foreignKeys, synchronous, cacheSizeKB, mmapSize, ...walOptions } = options;
  const label = options.databaseLabel ?? 'sqlite';

  // 根据 profile 获取默认 cache/mmap，显式参数优先
  const profileConfig = getProfileConfig(profile ?? 'default');
  const resolvedCacheSizeKB = cacheSizeKB ?? profileConfig.cacheSizeKB;
  const resolvedMmapSize = mmapSize ?? profileConfig.mmapSize;

  // 1. busy_timeout
  if (busyTimeoutMs !== undefined) {
    db.pragma(`busy_timeout = ${busyTimeoutMs}`);
  }

  // 2. WAL 维护
  const maintenance = configureSqliteWalMaintenance(db, walOptions);

  // 3. synchronous（NORMAL 比 FULL 快 10 倍，崩溃只丢最后一事务）
  if (synchronous) {
    db.pragma(`synchronous = ${synchronous}`);
  }

  // 4. foreign_keys
  if (foreignKeys) {
    db.pragma('foreign_keys = ON');
  }

  // 5. cache_size（负数 = KB）
  db.pragma(`cache_size = -${resolvedCacheSizeKB}`);

  // 6. mmap_size（让 OS 管理页面缓存，减少 RSS）
  if (resolvedMmapSize > 0) {
    db.pragma(`mmap_size = ${resolvedMmapSize}`);
  }

  logger.debug(`[SQLite] ${label} PRAGMA 配置完成: profile=${profile ?? 'default'}, cache=${resolvedCacheSizeKB}KB, mmap=${resolvedMmapSize}, sync=${synchronous ?? 'default'}`);

  return maintenance;
}
