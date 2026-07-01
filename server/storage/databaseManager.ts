/**
 * 数据库统一管理器
 *
 * 将 5 个独立 SQLite 数据库连接合并为 2 个：
 * - 主库 chat.db：所有业务表（消息、会话、配置、webhook、goals、secrets、events、mcp_servers）
 * - 向量库 vec_memory.db：需要 sqlite-vec 扩展的表（memory_vec_index、FTS、wiki）
 *
 * 使用方式：
 *   import { DatabaseManager } from '../storage/databaseManager.js';
 *   const mainDb = DatabaseManager.getMainDb();
 *   const vecDb = DatabaseManager.getVecDb();
 */

import path from 'path';
import Database from 'better-sqlite3';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';
import { configureSqliteConnectionPragmas, type SqliteWalMaintenance } from './sqliteWalMaintenance.js';
import { getDb } from '../db-core.js';

class DatabaseManagerImpl {
  private vecDb: Database.Database | null = null;
  private vecMaintenance: SqliteWalMaintenance | null = null;

  /**
   * 获取主数据库（chat.db）
   *
   * 复用 db-core 的 getDb() 连接，避免重复打开 chat.db。
   * db-core 负责备份恢复、完整性检查、WAL 维护等。
   */
  getMainDb(): Database.Database {
    return getDb();
  }

  /** 获取向量数据库（vec_memory.db） */
  getVecDb(): Database.Database {
    if (!this.vecDb) {
      const dbPath = path.join(AppPaths.memoryDir, 'long_term_memory.db');
      this.vecDb = new Database(dbPath);
      this.vecMaintenance = configureSqliteConnectionPragmas(this.vecDb, {
        profile: 'small',
        databaseLabel: 'vec_memory.db (向量库)',
        busyTimeoutMs: 30_000,
        synchronous: 'NORMAL',
        foreignKeys: false,
      });
      logger.info(`[DatabaseManager] 向量库已打开: ${dbPath}`);
    }
    return this.vecDb;
  }

  /** 关闭向量数据库连接（主库由 db-core.closeDb() 管理） */
  closeAll(): void {
    if (this.vecMaintenance) {
      this.vecMaintenance.close();
      this.vecMaintenance = null;
    }
    if (this.vecDb) {
      this.vecDb.close();
      this.vecDb = null;
      logger.info('[DatabaseManager] 向量库已关闭');
    }
  }
}

/** 全局单例 */
export const DatabaseManager = new DatabaseManagerImpl();
