import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';
import { AppPaths } from './config/appPaths.js';

import { initWmsTables } from './db-wms.js';
import { initChatTables } from './db-chat.js';
import { initAutomationTables } from './db-automation.js';
import { initMarketplaceTables } from './db-marketplace.js';
import { initProjectTables } from './db-project.js';
import { initPluginTables } from './db-plugin.js';
import { initGoalTables } from './engine/goalStore.js';
import { initWebhookTables } from './dao/webhookDao.js';
import { initArchiveTables } from './engine/messageArchive.js';

import { SQLiteEngine } from './storage/SQLiteEngine.js';
import { FileStorage } from './storage/FileStorage.js';
import { migrateSessionsToJsonl } from './storage/migration.js';
import type { IStorageEngine } from './storage/StorageEngine.js';
import { configureSqliteConnectionPragmas } from './storage/sqliteWalMaintenance.js';
import type { SqliteWalMaintenance } from './storage/sqliteWalMaintenance.js';

export * from './db-wms.js';
export * from './db-chat.js';
export * from './db-automation.js';
export * from './db-marketplace.js';
export * from './db-project.js';
export * from './db-plugin.js';

// Legacy types used by dao/skills.ts (not tied to any SQL table)
export interface UserSkillRow {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  path: string;
  trigger: string | null;
  detail: string | null;
  tags: string | null;
  status: string;
  version: string | null;
  featured: number;
  shortcut: string | null;
  installedAt: number;
  promptTemplate: string | null;
  executionMode: string | null;
}

export interface BuiltinStatusPatchRow {
  skillId: string;
  status: string;
}

const DB_PATH = AppPaths.chatDbFile;
const DB_BACKUP_PATH = AppPaths.chatDbFile + '.bak';

let db: Database.Database | null = null;
let walMaintenance: SqliteWalMaintenance | null = null;

/** v1.9.3: 备份数据库 */
function backupDatabase(): void {
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
      logger.info('[DB] 数据库已备份到 chat.db.bak');
    }
  } catch (e) {
    logger.warn('[DB] 数据库备份失败:', e);
  }
}

/** v1.9.3: 从备份恢复数据库 */
function restoreDatabaseFromBackup(): boolean {
  try {
    // v2.3.3: 增强恢复逻辑 — 如果主 DB 文件损坏（0 字节）或 WAL 残留，从备份恢复
    if (fs.existsSync(DB_BACKUP_PATH)) {
      const mainExists = fs.existsSync(DB_PATH);
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';

      if (!mainExists) {
        // 主文件完全丢失，从备份恢复
        fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
        logger.info('[DB] 数据库已从备份恢复（主文件丢失）');
        return true;
      }

      // v2.3.3: WAL 崩溃残留检测 — 如果有 WAL 但没有 SHM，或 WAL 异常大
      if (fs.existsSync(walPath)) {
        const walSize = fs.statSync(walPath).size;
        const mainSize = fs.statSync(DB_PATH).size;
        // WAL 大于主 DB 的 50% 且没有 SHM → 可能是崩溃残留
        if (walSize > mainSize * 0.5 && !fs.existsSync(shmPath)) {
          logger.info('[DB] 检测到 WAL 崩溃残留，从备份恢复:', { walSize, mainSize });
          // 删除损坏的主文件和 WAL
          fs.unlinkSync(DB_PATH);
          fs.unlinkSync(walPath);
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 数据库已从备份恢复（WAL 崩溃残留）');
          return true;
        }
      }
    }
  } catch (e) {
    logger.warn('[DB] 从备份恢复失败:', e);
  }
  return false;
}

export function initDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // v1.9.3: 如果数据库文件丢失，尝试从备份恢复
  restoreDatabaseFromBackup();

  // v2.3.3: 启动前先做 WAL checkpoint，防止上次崩溃残留的 WAL 导致数据丢失
  if (fs.existsSync(DB_PATH)) {
    try {
      const tempDb = new Database(DB_PATH);
      tempDb.pragma('wal_checkpoint(TRUNCATE)');
      tempDb.close();
    } catch {
      logger.info('[DB] WAL checkpoint 失败，尝试恢复...');
      if (fs.existsSync(DB_BACKUP_PATH)) {
        try { fs.unlinkSync(DB_PATH); } catch {}
        try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
        try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
        try {
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 数据库已从备份恢复（WAL checkpoint 失败）');
        } catch (e: any) {
          logger.error('[DB] 从备份恢复失败:', e?.message ?? String(e));
        }
      }
    }
  }

  // v1.9.3: 如果数据库存在，先备份
  backupDatabase();

  try {
    db = new Database(DB_PATH);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    logger.error('[DB] 数据库初始化失败:', msg);
    if (/busy|locked|permission|cannot open/i.test(msg)) {
      logger.error('[DB] 数据库文件可能被其他进程占用或权限不足，请关闭所有可能访问 ~/.cdf-know-clow/chat.db 的程序');
      if (fs.existsSync(DB_BACKUP_PATH)) {
        try {
          fs.unlinkSync(DB_PATH);
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 已从备份恢复数据库，重试初始化...');
          db = new Database(DB_PATH);
        } catch (e2: any) {
          logger.error('[DB] 从备份恢复失败:', e2?.message ?? e2);
          throw e;
        }
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  // v2.10: 使用统一 PRAGMA 配置（WAL + foreign_keys + busy_timeout + cache_size + mmap_size）
  try {
    walMaintenance = configureSqliteConnectionPragmas(db, {
      profile: 'large',
      databaseLabel: 'chat.db',
      foreignKeys: true,
      busyTimeoutMs: 30_000,
      synchronous: 'NORMAL',
    });
  } catch {
    // readonly mode — fallback below
  }

  // v2.8.9: 检测数据库是否只读（macOS com.apple.provenance 安全限制）
  let isMemoryDb = false;
  try {
    db.pragma('wal_checkpoint(RESTART)');
  } catch {
    logger.warn('[DB] 数据库只读（可能是 macOS 安全限制），切换到内存数据库');
    try { db.close(); } catch {}
    db = new Database(':memory:');
    walMaintenance = configureSqliteConnectionPragmas(db, {
      profile: 'large',
      databaseLabel: 'chat.db:memory',
      foreignKeys: true,
      busyTimeoutMs: 30_000,
      synchronous: 'NORMAL',
      mmapSize: 0,
    });
    isMemoryDb = true;
    logger.info('[DB] 已切换到内存数据库（数据不会持久化）');
  }

  // v1.5.68: 启动时做完整性检查
  try { db.pragma('wal_checkpoint(RESTART)'); } catch {
    logger.warn('[DB] WAL checkpoint 失败（可能是只读模式），跳过');
  }
  try {
    const integrityResult = db.pragma('integrity_check') as Array<{ integrity_check: string }> | string;
    let isOk = false;
    if (typeof integrityResult === 'string') {
      isOk = integrityResult === 'ok';
      if (!isOk) {
        logger.error('[DB] ❌ integrity_check 失败:', integrityResult);
      }
    } else if (Array.isArray(integrityResult) && integrityResult.length > 0) {
      const first = integrityResult[0]?.integrity_check;
      isOk = first === 'ok';
      if (!isOk) {
        logger.error('[DB] ❌ integrity_check 失败:', first);
      }
    }

    if (!isOk) {
      logger.warn('[ChatDB] 数据库完整性检查失败，尝试从 WAL 恢复...');
      db.pragma('wal_checkpoint(TRUNCATE)');
      const recheck = db.pragma('integrity_check') as Array<{ integrity_check: string }> | string;
      let recheckOk = false;
      if (typeof recheck === 'string') {
        recheckOk = recheck === 'ok';
      } else if (Array.isArray(recheck) && recheck.length > 0) {
        recheckOk = recheck[0]?.integrity_check === 'ok';
      }
      if (recheckOk) {
        logger.info('[DB] ✅ WAL 恢复成功，完整性检查通过');
      } else {
        logger.error('[ChatDB] 数据库无法恢复，需手动修复');
      }
    } else {
      logger.info('[DB] ✅ integrity_check 通过');
    }
  } catch (e) {
    logger.warn('[DB] integrity_check 异常:', e);
  }

  // v2.10: 周期 checkpoint 已由 configureSqliteConnectionPragmas 内部定时器管理

  // Initialize all domain tables
  // v9.0: 从 SQLite 迁移会话到 JSONL（在重建表结构之前迁移，避免数据丢失）
  migrateSessionsToJsonl(db);
  initChatTables(db);
  initWmsTables(db);
  initAutomationTables(db);
  initMarketplaceTables(db);
  initProjectTables(db);
  initPluginTables(db);
  initGoalTables(db);
  initWebhookTables(db);
  initArchiveTables(db);

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    return initDb();
  }
  return db;
}

/** v2.10: 优雅关闭数据库（清理 WAL 定时器 + 最终 TRUNCATE checkpoint） */
export function closeDb(): void {
  // 先关闭 DatabaseManager 管理的连接（向量库等）
  try {
    const { DatabaseManager } = require('./storage/databaseManager.js') as { DatabaseManager: { closeAll: () => void } };
    DatabaseManager.closeAll();
  } catch { /* ignore */ }

  if (walMaintenance) {
    walMaintenance.close();
    walMaintenance = null;
    logger.info('[DB] WAL 维护已关闭，最终 checkpoint 完成');
  }
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }

}

// ===================== v2.9: Worker Thread Pool（异步 API） =====================

import { DbWorkerPool } from './dbWorkerPool.js';

let dbPool: DbWorkerPool | null = null;

/** 获取异步数据库连接池（用于高并发场景） */
export function getDbPool(): DbWorkerPool {
  if (!dbPool) {
    // v9.0: 确保 FileStorage 目录存在
    FileStorage.ensureDirectories();
    dbPool = new DbWorkerPool(DB_PATH);
    dbPool.init();
  }
  return dbPool;
}

/** 获取存储引擎实例（已废弃，使用 getDb() 获取原生 better-sqlite3 连接） */
export function getStorageEngine(): null {
  return null;
}

/** 获取 FileStorage 工具类 */
export function getFileStorage() { return FileStorage; }
