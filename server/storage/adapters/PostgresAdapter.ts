// ============================================================================
// storage/adapters/PostgresAdapter.ts — PostgreSQL 适配器
//
// 实现 IStorageEngine，以 PostgreSQL 为后端。
// 适用于生产环境多进程共享数据场景。
// ============================================================================

import { createRequire } from 'node:module';
import type { IStorageEngine, IPreparedStatement } from '../StorageEngine.js';

const basePath = typeof __filename !== 'undefined' ? __filename : 'file:///dummy.js';
const localRequire = createRequire(basePath);

// ---------------------------------------------------------------------------
// 类型：pg 驱动的最小类型子集（避免强依赖 pg 的类型包）
// ---------------------------------------------------------------------------

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number;
  }>;
}

interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{
    rows: Record<string, unknown>[];
    rowCount: number;
  }>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

// ---------------------------------------------------------------------------
// 工具：安全加载 pg 驱动
// ---------------------------------------------------------------------------

let pgModule: { Pool: new (config: { connectionString: string }) => PgPool } | null = null;
let pgLoadError: string | null = null;

function loadPgDriver(): { Pool: new (config: { connectionString: string }) => PgPool } {
  if (pgModule) return pgModule;
  if (pgLoadError) throw new Error(`PostgreSQL 驱动不可用: ${pgLoadError}`);
  try {
    pgModule = localRequire('pg') as { Pool: new (config: { connectionString: string }) => PgPool };
    return pgModule;
  } catch (e) {
    pgLoadError = e instanceof Error ? e.message : String(e);
    throw new Error(
      `PostgreSQL 驱动 (pg) 未安装。请执行: npm install pg\n` +
      `原始错误: ${pgLoadError}`,
    );
  }
}

// 仅供测试使用：重置驱动缓存
export function _resetPgDriverCache(): void {
  pgModule = null;
  pgLoadError = null;
}

// ---------------------------------------------------------------------------
// PostgresAdapter
// ---------------------------------------------------------------------------

export class PostgresAdapter implements IStorageEngine {
  private pool: PgPool | null = null;
  private connectionString: string;
  private connected = false;

  constructor(config: { connectionString: string }) {
    this.connectionString = config.connectionString;
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    if (this.connected && this.pool) {
      return;
    }
    const pg = loadPgDriver();
    this.pool = new pg.Pool({ connectionString: this.connectionString });
    // 验证连接
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      (client as unknown as { release(): void }).release?.();
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    const pool = this.pool;
    if (!pool) throw new Error('PostgresAdapter: 未连接');
    const finalSql = this.normalizeSql(sql);
    return {
      async run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
        const result = await pool.query(finalSql, params);
        const lastId = result.rows[0]?.id ?? 0;
        return {
          changes: result.rowCount ?? 0,
          lastInsertRowid: Number(lastId),
        };
      },
      async get<T>(...params: unknown[]): Promise<T | undefined> {
        const result = await pool.query(finalSql, params);
        return result.rows[0] as T | undefined;
      },
      async all<T>(...params: unknown[]): Promise<T[]> {
        const result = await pool.query(finalSql, params);
        return result.rows as T[];
      },
    } as unknown as IPreparedStatement;
  }

  exec(sql: string): void {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    // 异步执行但以同步形式抛出（IStorageEngine 接口是同步的，
    // 这里使用 Promise 链但不等待 — 由上层通过 connect 后调用
    void this.pool.query(this.normalizeSql(sql));
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    // 注意：IStorageEngine 接口为同步签名，
    // Postgres 是异步的。调用方应使用 prepare().get() 异步版本。
    // 这里提供同步包装通过内部队列实现，但实际推荐使用 prepare() 返回的异步语句。
    throw new Error(
      'PostgresAdapter.get 不支持同步调用，请使用 prepare(sql).get(params) 异步形式',
    );
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    throw new Error(
      'PostgresAdapter.all 不支持同步调用，请使用 prepare(sql).all(params) 异步形式',
    );
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    throw new Error(
      'PostgresAdapter.run 不支持同步调用，请使用 prepare(sql).run(params) 异步形式',
    );
  }

  // ==========================================================================
  // 事务
  // ==========================================================================

  transaction<T>(fn: () => T): T {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    throw new Error(
      'PostgresAdapter.transaction 为异步操作，请使用 transactionAsync 方法',
    );
  }

  /**
   * 异步事务包装：在事务中执行回调。
   * fn 返回 T 时自动 COMMIT，抛出异常时自动 ROLLBACK。
   */
  async transactionAsync<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      (client as unknown as { release(): void }).release?.();
    }
  }

  // ==========================================================================
  // 迁移
  // ==========================================================================

  migrate(version: string, sql: string): void {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    throw new Error(
      'PostgresAdapter.migrate 为异步操作，请使用 migrateAsync 方法',
    );
  }

  /** 异步版本化迁移 */
  async migrateAsync(version: string, sql: string): Promise<void> {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    await this.transactionAsync(async (client) => {
      await client.query(sql);
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      await client.query(
        `INSERT INTO app_settings (key, value) VALUES ('version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [version],
      );
      return undefined;
    });
  }

  getVersion(): string {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    throw new Error(
      'PostgresAdapter.getVersion 为异步操作，请使用 getVersionAsync 方法',
    );
  }

  /** 异步读取 schema 版本 */
  async getVersionAsync(): Promise<string> {
    if (!this.pool) throw new Error('PostgresAdapter: 未连接');
    try {
      const result = await this.pool.query(
        `SELECT value FROM app_settings WHERE key = 'version'`,
      );
      return (result.rows[0]?.value as string) ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  /**
   * 将 SQLite 风格的 ? 占位符转换为 Postgres 的 $1, $2 风格。
   */
  private normalizeSql(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    });
  }
}
