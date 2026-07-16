// ============================================================================
// storage/adapters/LanceDBAdapter.ts — LanceDB 适配器
//
// 实现 IStorageEngine，以 LanceDB（列式向量数据库）为后端。
// 适用于大规模向量检索与 Embedding 存储。
//
// 注意：LanceDB 原生不提供 SQL 接口，此适配器通过 LanceDB Node.js API
// 模拟关系型操作。核心能力是向量检索和列式存储。
// ============================================================================

import { createRequire } from 'node:module';
import type { IStorageEngine, IPreparedStatement } from '../StorageEngine.js';

const basePath = typeof __filename !== 'undefined' ? __filename : 'file:///dummy.js';
const localRequire = createRequire(basePath);

// ---------------------------------------------------------------------------
// 类型：LanceDB 驱动的最小类型子集
// ---------------------------------------------------------------------------

interface LanceTable {
  name: string;
  countRows(): Promise<number>;
  add(rows: Record<string, unknown>[]): Promise<void>;
  delete(predicate: string): Promise<void>;
  query(): LanceQueryBuilder;
  vectorSearch(vector: number[]): LanceVectorSearch;
  close(): Promise<void>;
}

interface LanceQueryBuilder {
  filter(predicate: string): LanceQueryBuilder;
  select(columns: string[]): LanceQueryBuilder;
  limit(n: number): LanceQueryBuilder;
  offset(n: number): LanceQueryBuilder;
  toArray(): Promise<Record<string, unknown>[]>;
}

interface LanceVectorSearch {
  limit(n: number): LanceVectorSearch;
  filter(predicate: string): LanceVectorSearch;
  column(column: string): LanceVectorSearch;
  toArray(): Promise<Record<string, unknown>[]>;
}

interface LanceDBClient {
  openTable(name: string): Promise<LanceTable>;
  createTable(
    name: string,
    data: Record<string, unknown>[],
    options?: { mode?: 'overwrite' | 'append' },
  ): Promise<LanceTable>;
  dropTable(name: string): Promise<void>;
  tableNames(): Promise<string[]>;
}

interface LanceDBConnection {
  (uri: string): Promise<LanceDBClient>;
}

// ---------------------------------------------------------------------------
// 工具：安全加载 LanceDB 驱动
// ---------------------------------------------------------------------------

let lancedbModule: { connect: LanceDBConnection } | null = null;
let lancedbLoadError: string | null = null;

function loadLanceDBDriver(): { connect: LanceDBConnection } {
  if (lancedbModule) return lancedbModule;
  if (lancedbLoadError) throw new Error(`LanceDB 驱动不可用: ${lancedbLoadError}`);
  try {
    const mod = localRequire('lancedb') as { connect: LanceDBConnection };
    lancedbModule = mod;
    return lancedbModule;
  } catch (e) {
    lancedbLoadError = e instanceof Error ? e.message : String(e);
    throw new Error(
      `LanceDB 驱动 (lancedb) 未安装。请执行: npm install lancedb\n` +
      `原始错误: ${lancedbLoadError}`,
    );
  }
}

// 仅供测试使用：重置驱动缓存
export function _resetLanceDBDriverCache(): void {
  lancedbModule = null;
  lancedbLoadError = null;
}

// ---------------------------------------------------------------------------
// LanceDBAdapter
// ---------------------------------------------------------------------------

export class LanceDBAdapter implements IStorageEngine {
  private uri: string;
  private client: LanceDBClient | null = null;
  private tableCache = new Map<string, LanceTable>();
  private connected = false;

  constructor(config: { uri: string }) {
    this.uri = config.uri;
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }
    const lancedb = loadLanceDBDriver();
    this.client = await lancedb.connect(this.uri);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // 关闭所有缓存的 table
    for (const table of this.tableCache.values()) {
      try {
        await table.close();
      } catch {
        // ignore
      }
    }
    this.tableCache.clear();
    this.client = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  // ==========================================================================
  // 向量/列式操作（核心功能）
  // ==========================================================================

  /** 创建表（基于初始数据） */
  async createTable(
    tableName: string,
    initialData: Record<string, unknown>[] = [{ _id: 'init', _init: true }],
  ): Promise<LanceTable> {
    if (!this.client) throw new Error('LanceDBAdapter: 未连接');
    const table = await this.client.createTable(tableName, initialData);
    this.tableCache.set(tableName, table);
    return table;
  }

  /** 打开表（不存在则创建） */
  async openTable(tableName: string): Promise<LanceTable> {
    if (!this.client) throw new Error('LanceDBAdapter: 未连接');
    const cached = this.tableCache.get(tableName);
    if (cached) return cached;
    try {
      const table = await this.client.openTable(tableName);
      this.tableCache.set(tableName, table);
      return table;
    } catch {
      // 表不存在则创建
      return this.createTable(tableName);
    }
  }

  /** 列出所有表名 */
  async listTables(): Promise<string[]> {
    if (!this.client) throw new Error('LanceDBAdapter: 未连接');
    return this.client.tableNames();
  }

  /** 删除表 */
  async dropTable(tableName: string): Promise<void> {
    if (!this.client) throw new Error('LanceDBAdapter: 未连接');
    this.tableCache.delete(tableName);
    await this.client.dropTable(tableName);
  }

  /**
   * 插入/追加行数据。
   * @param tableName 表名
   * @param rows 行对象数组
   */
  async insert(tableName: string, rows: Record<string, unknown>[]): Promise<void> {
    const table = await this.openTable(tableName);
    await table.add(rows);
  }

  /**
   * 向量相似度搜索。
   * @param tableName 表名
   * @param vector 查询向量
   * @param limit 返回数量
   * @param filter 过滤条件（LanceDB filter 表达式）
   */
  async vectorSearch(
    tableName: string,
    vector: number[],
    limit = 10,
    filter?: string,
  ): Promise<Record<string, unknown>[]> {
    const table = await this.openTable(tableName);
    let search = table.vectorSearch(vector).limit(limit);
    if (filter) {
      search = search.filter(filter);
    }
    return search.toArray();
  }

  /**
   * 按条件查询（非向量）。
   * @param tableName 表名
   * @param filter 过滤条件
   * @param limit 限制数量
   */
  async query(
    tableName: string,
    filter?: string,
    limit = 100,
  ): Promise<Record<string, unknown>[]> {
    const table = await this.openTable(tableName);
    let qb = table.query();
    if (filter) {
      qb = qb.filter(filter);
    }
    qb = qb.limit(limit);
    return qb.toArray();
  }

  /** 获取表的行数 */
  async countRows(tableName: string): Promise<number> {
    const table = await this.openTable(tableName);
    return table.countRows();
  }

  /**
   * 按条件删除行。
   * @param tableName 表名
   * @param predicate 删除条件（LanceDB predicate 字符串）
   */
  async deleteRows(tableName: string, predicate: string): Promise<void> {
    const table = await this.openTable(tableName);
    await table.delete(predicate);
  }

  // ==========================================================================
  // IStorageEngine 接口实现（最小兼容）
  //
  // LanceDB 原生无 SQL 接口。以下方法提供最小兼容实现，
  // 实际使用应调用上面的向量/列式专属方法。
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    throw new Error(
      'LanceDBAdapter 不支持 SQL 预编译。请使用列式/向量专属方法: query / vectorSearch / insert / ...',
    );
  }

  exec(sql: string): void {
    if (!this.connected || !this.client) throw new Error('LanceDBAdapter: 未连接');
    // 支持 CREATE TABLE IF NOT EXISTS <name> 语法
    const createMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?(\w+)"?/i);
    if (createMatch) {
      void this.openTable(createMatch[1]);
      return;
    }
    throw new Error(`LanceDBAdapter.exec 不支持的语句: ${sql.slice(0, 100)}`);
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    throw new Error(
      'LanceDBAdapter 不支持 SQL 查询。请使用列式专属方法: query / countRows / ...',
    );
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    throw new Error(
      'LanceDBAdapter 不支持 SQL 查询。请使用列式专属方法: query / vectorSearch / ...',
    );
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    throw new Error(
      'LanceDBAdapter 不支持 SQL 写入。请使用列式专属方法: insert / deleteRows / ...',
    );
  }

  transaction<T>(fn: () => T): T {
    throw new Error('LanceDBAdapter 不支持事务（LanceDB 为列式追加架构，无 ACID 事务）');
  }

  migrate(version: string, sql: string): void {
    throw new Error(
      'LanceDBAdapter.migrate 为异步操作，请使用 migrateAsync 方法',
    );
  }

  /** 异步版本化迁移 */
  async migrateAsync(version: string, migrationSql: string): Promise<void> {
    // 执行迁移 SQL（仅支持 CREATE TABLE 语句）
    if (migrationSql.trim()) {
      const statements = migrationSql.split(';').filter((s) => s.trim());
      for (const stmt of statements) {
        this.exec(stmt);
      }
    }
    // 确保 _schema_meta 表存在并写入版本
    const metaTable = await this.openTable('_schema_meta');
    // 删除旧版本记录
    try {
      await metaTable.delete("key = 'version'");
    } catch {
      // 忽略（可能表刚创建，无数据）
    }
    await metaTable.add([{ key: 'version', value: version, _ts: Date.now() }]);
  }

  getVersion(): string {
    throw new Error(
      'LanceDBAdapter.getVersion 为异步操作，请使用 getVersionAsync 方法',
    );
  }

  /** 异步读取 schema 版本 */
  async getVersionAsync(): Promise<string> {
    try {
      const table = await this.openTable('_schema_meta');
      const rows = await table.query()
        .filter("key = 'version'")
        .limit(1)
        .toArray();
      if (rows.length > 0 && rows[0].value) {
        return String(rows[0].value);
      }
      return '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
