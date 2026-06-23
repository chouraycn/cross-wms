// ============================================================================
// storage/StorageEngine.ts — 核心存储抽象接口
//
// 定义双层存储架构的第一层（引擎层）抽象接口。所有具体存储后端
// （SQLite / Redis / Postgres / LanceDB / Qdrant）均实现此接口。
// ============================================================================

/**
 * 预编译语句接口。
 * 对应 better-sqlite3 中 Statement 的功能子集。
 */
export interface IPreparedStatement {
  /** 执行带参数的 SQL，返回影响行数与最后插入 ID */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };

  /** 查询单行 */
  get<T>(...params: unknown[]): T | undefined;

  /** 查询多行 */
  all<T>(...params: unknown[]): T[];
}

/**
 * 存储引擎核心接口。
 *
 * 分组说明：
 * ─ 连接管理 — 生命周期控制
 * ─ 通用查询 — prepare / exec / get / all / run
 * ─ 事务     — 嵌套安全的事务包装
 * ─ 迁移     — 版本化 SQL 迁移
 */
export interface IStorageEngine {
  // ==========================================================================
  // 连接管理
  // ==========================================================================

  /** 建立与后端的连接 */
  connect(): Promise<void>;

  /** 断开连接并释放资源 */
  disconnect(): Promise<void>;

  /** 当前是否已连接 */
  isConnected(): boolean;

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  /** 预编译一条 SQL 语句，返回可复用的 IPreparedStatement */
  prepare(sql: string): IPreparedStatement;

  /** 直接执行无返回值的 SQL（DDL / 批量操作） */
  exec(sql: string): void;

  /** 查询单行记录，返回泛型 T 或 undefined */
  get<T>(sql: string, params?: unknown[]): T | undefined;

  /** 查询多行记录，返回泛型 T 数组 */
  all<T>(sql: string, params?: unknown[]): T[];

  /**
   * 执行写入操作（INSERT / UPDATE / DELETE）。
   * 返回影响行数及最后插入行的自增 ID。
   */
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number };

  // ==========================================================================
  // 事务
  // ==========================================================================

  /**
   * 在事务中执行回调 fn。
   * - fn 返回 T 时自动 COMMIT；
   * - fn 抛出异常时自动 ROLLBACK。
   * 支持嵌套调用，外层事务提交时才会真正持久化。
   */
  transaction<T>(fn: () => T): T;

  // ==========================================================================
  // 迁移
  // ==========================================================================

  /** 执行一次版本化迁移：记录 version 并执行 SQL */
  migrate(version: string, sql: string): void;

  /** 读取当前 schema 版本号 */
  getVersion(): string;
}