// ============================================================================
// storage/SQLiteEngine.ts — SQLite 存储引擎完整实现
//
// 实现 IStorageEngine，基于 better-sqlite3 封装。
// 双层架构的第一层（引擎层）默认实现，适用于单机 / 桌面场景。
// ============================================================================

import Database from 'better-sqlite3';
import type { IStorageEngine, IPreparedStatement } from './StorageEngine.js';
import { logger } from '../logger.js';

/**
 * 基于 better-sqlite3 的默认存储引擎实现。
 */
export class SQLiteEngine implements IStorageEngine {
  private db: Database.Database | null = null;
  private dbPath: string;

  /**
   * @param dbPath SQLite 数据库文件路径
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    this.db = new Database(this.dbPath);
    // 启用 WAL 模式以提升并发读性能
    this.db.pragma('journal_mode = WAL');
    // 启用外键约束
    this.db.pragma('foreign_keys = ON');
    logger.info('[SQLiteEngine] connected to', this.dbPath);
  }

  disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('[SQLiteEngine] disconnected');
    }
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.db !== null && this.db.open;
  }

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    const stmt = this.db!.prepare(sql);
    return {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
        const result = stmt.run(...params);
        return {
          changes: result.changes,
          lastInsertRowid: Number(result.lastInsertRowid),
        };
      },
      get<T>(...params: unknown[]): T | undefined {
        return stmt.get(...params) as T | undefined;
      },
      all<T>(...params: unknown[]): T[] {
        return stmt.all(...params) as T[];
      },
    };
  }

  exec(sql: string): void {
    this.db!.exec(sql);
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.db!.prepare(sql);
    return stmt.get(...(params ?? [])) as T | undefined;
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db!.prepare(sql);
    return stmt.all(...(params ?? [])) as T[];
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    const stmt = this.db!.prepare(sql);
    const result = stmt.run(...(params ?? []));
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  // ==========================================================================
  // 事务
  // ==========================================================================

  transaction<T>(fn: () => T): T {
    const txn = this.db!.transaction(fn);
    return txn();
  }

  // ==========================================================================
  // 迁移
  // ==========================================================================

  migrate(version: string, sql: string): void {
    // 执行迁移 SQL
    this.db!.exec(sql);

    // 确保 app_settings 表存在
    this.db!.exec(
      `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );

    // 写入或更新版本号
    const stmt = this.db!.prepare(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('version', ?)`,
    );
    stmt.run(version);

    logger.info('[Migration] applied version', version);
  }

  getVersion(): string {
    try {
      const row = this.db!
        .prepare(`SELECT value FROM app_settings WHERE key = 'version'`)
        .get() as { value: string } | undefined;
      return row?.value ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}

/**
 * 便捷工厂：创建并自动连接到默认路径的 SQLite 数据库。
 */
export function createSQLiteEngine(dbPath: string): SQLiteEngine {
  return new SQLiteEngine(dbPath);
}