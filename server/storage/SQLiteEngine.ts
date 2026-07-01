// ============================================================================
// storage/SQLiteEngine.ts — SQLite 存储引擎完整实现
//
// 实现 IStorageEngine，基于 better-sqlite3 封装。
// 双层架构的第一层（引擎层）默认实现，适用于单机 / 桌面场景。
// ============================================================================

import Database from 'better-sqlite3';
import type { IStorageEngine, IPreparedStatement } from './StorageEngine.js';
import { logger } from '../logger.js';
import { configureSqliteConnectionPragmas } from './sqliteWalMaintenance.js';
import type { SqliteWalMaintenance, SqlitePragmaOptions } from './sqliteWalMaintenance.js';
import { createRequire } from 'node:module';

// commonjs 环境下直接使用全局 require
const localRequire = typeof require !== 'undefined' ? require : createRequire('file:///dummy.js');

let vecLoadError: string | null = null;

function tryLoadVecExtension(db: Database.Database): boolean {
  if (vecLoadError === 'not-available') return false;
  try {
    const sqliteVec = localRequire('sqlite-vec');
    sqliteVec.load(db);
    return true;
  } catch (e) {
    vecLoadError = 'not-available';
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[SQLiteEngine] sqlite-vec 扩展加载失败，向量记忆功能不可用: ${msg}`);
    return false;
  }
}

/**
 * 基于 better-sqlite3 的默认存储引擎实现。
 */
export class SQLiteEngine implements IStorageEngine {
  private db: Database.Database | null = null;
  private dbPath: string;
  private pragmaOptions: SqlitePragmaOptions;
  private walMaintenance: SqliteWalMaintenance | null = null;

  /**
   * @param dbPath SQLite 数据库文件路径
   * @param pragmaOptions PRAGMA 配置选项（可选，默认启用 WAL + 外键）
   */
  constructor(dbPath: string, pragmaOptions?: SqlitePragmaOptions) {
    this.dbPath = dbPath;
    this.pragmaOptions = pragmaOptions ?? {
      foreignKeys: true,
      busyTimeoutMs: 30_000,
      synchronous: 'NORMAL',
      cacheSizeKB: 4000,
      mmapSize: 64 * 1024 * 1024,
    };
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    if (this.db && this.db.open) {
      return;
    }
    this.db = new Database(this.dbPath);

    // v2.10: 使用统一 PRAGMA 配置
    const label = this.pragmaOptions.databaseLabel ?? this.dbPath;
    this.walMaintenance = configureSqliteConnectionPragmas(this.db, {
      ...this.pragmaOptions,
      databaseLabel: label,
    });

    // 尝试加载 sqlite-vec 向量扩展
    const vecOk = tryLoadVecExtension(this.db);
    if (vecOk) {
      logger.info('[SQLiteEngine] sqlite-vec 向量扩展已加载');
    }
    logger.info('[SQLiteEngine] connected to', this.dbPath);
  }

  disconnect(): Promise<void> {
    // v2.10: 优雅关闭 WAL 维护（清理定时器 + 最终 TRUNCATE checkpoint）
    if (this.walMaintenance) {
      this.walMaintenance.close();
      this.walMaintenance = null;
    }
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

  pragma(sql: string, options?: Database.PragmaOptions): unknown {
    return this.db!.pragma(sql, options);
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