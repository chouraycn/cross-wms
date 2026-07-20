// Kysely 风格查询的同步执行辅助。
// 移植自 openclaw/src/infra/kysely-sync.ts（降级实现）。
//
// 降级说明：
//  - kysely 包在 cross-wms 中不可用，所有 Kysely 查询编译调用降级为抛出错误。
//  - executeSqliteQuerySync 等同步执行函数保留签名，运行时返回空结果或抛出错误。
//  - 完整保留所有类型定义，供 voicewake、delivery-queue-sqlite 等模块依赖。
import type { SQLInputValue } from "node:sqlite";

// ============================================================================
// 降级的 Kysely 类型占位
// ============================================================================

/** Kysely 编译后的 SQL 查询占位类型 */
export type CompiledSqliteQuery = {
  sql: string;
  parameters: ReadonlyArray<SQLInputValue>;
};

/** Kysely 查询构建器占位类型 */
export type KyselyQueryBuilder = {
  compile(): CompiledSqliteQuery;
};

/** Kysely 数据库占位类型 */
export interface KyselyDatabase<DB = Record<string, unknown>> {
  readonly __DB: DB;
}

/** SQLite 查询执行结果 */
export type SqliteQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  changes: number;
  lastInsertRowid: number | bigint | null;
};

// ============================================================================
// 降级实现
// ============================================================================

const databaseCache = new WeakMap<object, KyselyDatabase>();

/**
 * 获取或创建一个 node:sqlite 数据库的 Kysely 编译 facade。
 * 降级实现：kysely 包不可用，返回占位 KyselyDatabase。
 * 任何调用 .selectFrom() 等查询构建器方法都会在运行时抛出错误。
 */
export function getNodeSqliteKysely<DB = Record<string, unknown>>(
  db: unknown,
): KyselyDatabase<DB> {
  const cacheKey = (db ?? {}) as object;
  const cached = databaseCache.get(cacheKey) as KyselyDatabase<DB> | undefined;
  if (cached) {
    return cached;
  }
  const facade = createCompileOnlyKyselyFacade<DB>(db);
  databaseCache.set(cacheKey, facade as KyselyDatabase);
  return facade;
}

/**
 * 执行编译后的 Kysely SQLite 查询（同步）。
 * 降级实现：kysely 包不可用，抛出 "not implemented" 错误。
 */
export function executeCompiledSqliteQuerySync(
  db: unknown,
  query: CompiledSqliteQuery,
): SqliteQueryResult {
  throw new Error(
    `executeCompiledSqliteQuerySync not implemented: kysely package not available (sql: ${query.sql})`,
  );
}

/**
 * 执行 Kysely 查询构建器并返回结果（同步）。
 * 降级实现：kysely 包不可用，抛出 "not implemented" 错误。
 */
export function executeSqliteQuerySync<T = Record<string, unknown>>(
  db: unknown,
  queryBuilder: KyselyQueryBuilder,
): SqliteQueryResult<T> {
  // 尝试编译查询以获取 SQL 用于错误信息
  let sql = "<unknown>";
  try {
    sql = queryBuilder.compile().sql;
  } catch {
    // 忽略编译错误
  }
  throw new Error(
    `executeSqliteQuerySync not implemented: kysely package not available (sql: ${sql})`,
  );
}

/**
 * 执行 Kysely 查询并返回第一行（同步）。
 * 降级实现：kysely 包不可用，抛出 "not implemented" 错误。
 */
export function executeSqliteQueryTakeFirstSync<T = Record<string, unknown>>(
  db: unknown,
  queryBuilder: KyselyQueryBuilder,
): T | undefined {
  const result = executeSqliteQuerySync<T>(db, queryBuilder);
  return result.rows[0];
}

/**
 * 清除指定数据库的 Kysely 缓存。
 */
export function clearNodeSqliteKyselyCacheForDatabase(db: unknown): void {
  const cacheKey = (db ?? {}) as object;
  databaseCache.delete(cacheKey);
}

// ============================================================================
// CompileOnly facade 内部实现
// ============================================================================

function createCompileOnlyKyselyFacade<DB>(_db: unknown): KyselyDatabase<DB> {
  // 返回一个代理对象，任何属性访问都会返回抛出错误的函数
  return new Proxy(
    { __DB: undefined as unknown as DB },
    {
      get(_target, prop) {
        if (prop === "__DB") {
          return undefined;
        }
        // 返回一个会抛出错误的函数
        return (..._args: unknown[]) => {
          throw new Error(
            `Kysely query builder method "${String(prop)}" not implemented: kysely package not available`,
          );
        };
      },
    },
  ) as KyselyDatabase<DB>;
}

// 占位类（保留导出供类型检查）
export class CompileOnlyNodeSqliteKyselyDialect {
  constructor(_config: unknown) {}
}

export class CompileOnlySqliteDriver {
  async init(): Promise<void> {}
  async acquireConnection(): Promise<unknown> {
    // Stub: not fully ported
  }
  async releaseConnection(_connection: unknown): Promise<void> {}
  async destroy(): Promise<void> {}
}

export class CompileOnlySqliteAdapter {}
