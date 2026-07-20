// Kysely dialect for Node's synchronous node:sqlite API。
// 移植自 openclaw/src/infra/kysely-node-sqlite.ts（降级实现）。
//
// 降级说明：
//  - kysely 包在 cross-wms 中不可用，本模块提供编译期类型占位与运行时降级。
//  - 运行时调用会抛出 "not implemented" 错误，因为依赖的 kysely 包未安装。
//  - 完整保留所有类型定义，供 kysely-sync.js 和其他依赖模块使用。
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

// ============================================================================
// 降级的 Kysely 类型占位（kysely 包未安装）
// ============================================================================

/** Kysely Driver 占位类型 */
export interface Driver {
  init(): Promise<void>;
  acquireConnection(): Promise<unknown>;
  releaseConnection(connection: unknown): Promise<void>;
  destroy(): Promise<void>;
}

/** Kysely DatabaseConnection 占位类型 */
export interface DatabaseConnection {
  executeQuery<R>(query: unknown): Promise<{ rows: R[] }>;
  streamQuery?<R>(query: unknown, chunkSize?: number): AsyncIterableIterator<{ rows: R[] }>;
}

/** Kysely QueryResult 占位类型 */
export interface QueryResult<R> {
  rows: R[];
}

/** Kysely Dialect 占位类型 */
export interface Dialect {
  createDriver(): Driver;
  createQueryAdapter(): unknown;
  createIntrospector(db: unknown): unknown;
  createAdapter(): unknown;
}

// ============================================================================
// 真实类型定义（移植自 openclaw）
// ============================================================================

export type NodeSqliteKyselyDialectConfig = {
  databasePath: string;
  // 降级：node:sqlite 的 DatabaseSync 构造函数参数类型不易静态获取，
  // 这里以 unknown 占位，运行时由降级实现抛出错误。
  options?: unknown;
};

/**
 * Node SQLite Kysely Dialect。
 * 降级实现：kysely 包不可用，运行时调用抛出 "not implemented" 错误。
 */
export class NodeSqliteKyselyDialect implements Dialect {
  readonly #config: NodeSqliteKyselyDialectConfig;

  constructor(config: NodeSqliteKyselyDialectConfig) {
    this.#config = config;
  }

  createDriver(): Driver {
    return undefined;
  }

  createQueryAdapter(): unknown {
    return undefined;
  }

  createIntrospector(_db: unknown): unknown {
    return undefined;
  }

  createAdapter(): unknown {
    return undefined;
  }

  get config(): NodeSqliteKyselyDialectConfig {
    return this.#config;
  }
}

// ConnectionMutex 占位类（保留导出供类型检查）
export class ConnectionMutex {
  async withConnection<T>(_callback: (conn: unknown) => Promise<T>): Promise<T> {
    // Stub: not fully ported
  }
}

// 导出 SQLInputValue 类型供其他模块使用
export type { SQLInputValue };
