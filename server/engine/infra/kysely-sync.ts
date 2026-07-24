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

/** Kysely 表达式构建器占位类型 */
export type KyselyExpressionBuilder = {
  ref: (column: string) => unknown;
};

/** Kysely ON CONFLICT 构建器占位类型 */
export type KyselyOnConflictBuilder = {
  columns: (columns: readonly string[]) => {
    doUpdateSet: (
      set: Record<string, unknown | ((eb: KyselyExpressionBuilder) => unknown)>,
    ) => KyselyQueryBuilder;
  };
};

/** Kysely 查询构建器占位类型 */
export type KyselyQueryBuilder = {
  compile(): CompiledSqliteQuery;
  select: (columns: readonly string[]) => KyselyQueryBuilder;
  orderBy: (column: string, order?: string) => KyselyQueryBuilder;
  values: (row: Record<string, unknown>) => KyselyQueryBuilder;
  onConflict: (cb: (conflict: KyselyOnConflictBuilder) => KyselyQueryBuilder) => KyselyQueryBuilder;
  where: (...args: unknown[]) => KyselyQueryBuilder;
};

/** Kysely 数据库占位类型 */
export interface KyselyDatabase<DB = Record<string, unknown>> {
  readonly __DB: DB;
  selectFrom: (table: string) => KyselyQueryBuilder;
  insertInto: (table: string) => KyselyQueryBuilder;
  deleteFrom: (table: string) => KyselyQueryBuilder;
  updateTable: (table: string) => KyselyQueryBuilder;
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
 * 降级实现：kysely 包不可用，返回空结果集而非抛出错误。
 * 调用方应预期在降级模式下获得空结果。
 */
export function executeCompiledSqliteQuerySync(
  _db: unknown,
  query: CompiledSqliteQuery,
): SqliteQueryResult {
  return { rows: [], changes: 0, lastInsertRowid: null };
}

/**
 * 执行 Kysely 查询构建器并返回结果（同步）。
 * 降级实现：kysely 包不可用，返回空结果集而非抛出错误。
 */
export function executeSqliteQuerySync<T = Record<string, unknown>>(
  _db: unknown,
  _queryBuilder: KyselyQueryBuilder,
): SqliteQueryResult<T> {
  return { rows: [], changes: 0, lastInsertRowid: null };
}

/**
 * 执行 Kysely 查询并返回第一行（同步）。
 * 降级实现：kysely 包不可用，返回 undefined（空结果集的第一行）。
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

type NoopChainFn = (() => NoopChainFn) & { compile: () => CompiledSqliteQuery };

function createCompileOnlyKyselyFacade<DB>(_db: unknown): KyselyDatabase<DB> {
  // 返回一个链式代理对象，任何属性访问都返回可链式调用的 no-op 函数。
  // 最终调用 .compile() 时返回空查询。这允许调用方链式构建查询而不崩溃。
  const noopChain = (): NoopChainFn => {
    const fn = (() => noopChain()) as NoopChainFn;
    fn.compile = (): CompiledSqliteQuery => ({ sql: "", parameters: [] });
    return fn;
  };
  return new Proxy(
    { __DB: undefined as unknown as DB },
    {
      get(_target, prop) {
        if (prop === "__DB") {
          return undefined;
        }
        // 返回可链式调用的 no-op 函数，最终 compile() 返回空查询
        return noopChain();
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
    return undefined;
  }
  async releaseConnection(_connection: unknown): Promise<void> {}
  async destroy(): Promise<void> {}
}

export class CompileOnlySqliteAdapter {}
