// ============================================================================
// storage/UnifiedStorage.ts — 统一存储访问接口
//
// 在 IStorageEngine（SQL 语义）和 DocumentStorage（集合 / 文档语义）之上
// 提供更高层抽象，使上层业务代码不感知底层后端。
//
// 设计目标：
//   - 上层通过 getCollection<T>(name) 获取集合操作句柄
//   - 通过 query<T>(collection, filter) 查询，filter 为字段匹配对象
//   - 通过 transaction(work) 保证跨集合操作的原子性
//   - 通过 healthCheck() 检测后端可用性
//   - 通过 UnifiedStorageConfig 按集合粒度配置后端
// ============================================================================

import type { DocumentStorage } from './DocumentStorage.js';
import type { IStorageEngine } from './StorageEngine.js';
import { MemoryDocumentStorage } from './DocumentStorage.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 集合后端类型 */
export type CollectionBackend = 'document' | 'sql';

/**
 * 统一存储配置。
 * 指定每个集合使用哪个后端，以及各后端的实例。
 */
export interface UnifiedStorageConfig {
  /** DocumentStorage 实例（用于 'document' 后端的集合） */
  documentStorage?: DocumentStorage;

  /** IStorageEngine 实例（用于 'sql' 后端的集合） */
  sqlEngine?: IStorageEngine;

  /**
   * 集合到后端的映射。
   * 未在此映射中的集合默认使用 'document'。
   */
  collectionBackends?: Record<string, CollectionBackend>;

  /** 默认后端类型，默认 'document' */
  defaultBackend?: CollectionBackend;
}

/** 查询过滤器：字段名到期望值的映射，所有条件为 AND 关系 */
export type QueryFilter<T> = Partial<T>;

/** 集合操作句柄：提供类型安全的 CRUD 方法 */
export interface CollectionHandle<T> {
  /** 列出全部文档 */
  list(): T[];

  /** 按 id 获取单个文档 */
  get(id: string | number): T | undefined;

  /** 创建文档 */
  create(id: string | number, data: T): T;

  /** 局部更新文档 */
  update(id: string | number, data: Partial<T>): T | null;

  /** 删除文档 */
  delete(id: string | number): boolean;

  /** 按字段匹配查询 */
  query(filter: QueryFilter<T>): T[];

  /** 文档数量 */
  count(): number;

  /** 取下一个自增 id */
  nextId(): number;
}

/** 健康检查结果 */
export interface HealthCheckResult {
  /** 后端是否可用 */
  healthy: boolean;
  /** 后端类型 */
  backend: CollectionBackend;
  /** 附加信息（如错误消息） */
  message?: string;
}

// ---------------------------------------------------------------------------
// 统一存储接口
// ---------------------------------------------------------------------------

/**
 * 统一存储访问接口。
 *
 * 抽象 DocumentStorage 和 IStorageEngine 两种后端，
 * 上层代码通过此接口操作数据，不直接依赖具体后端。
 */
export interface UnifiedStorage {
  /** 获取集合操作句柄 */
  getCollection<T>(name: string): CollectionHandle<T>;

  /** 按字段匹配查询集合 */
  query<T>(collection: string, filter: QueryFilter<T>): T[];

  /** 在事务中执行回调（保证原子性，不支持时降级为直接执行） */
  transaction<T>(work: () => T): T;

  /** 健康检查 */
  healthCheck(): HealthCheckResult;

  /** 获取指定集合的后端类型 */
  getBackend(collection: string): CollectionBackend;
}

// ---------------------------------------------------------------------------
// 基于 DocumentStorage 的实现
// ---------------------------------------------------------------------------

/**
 * 检查对象是否匹配过滤条件（所有字段值相等）。
 */
function matchesFilter<T>(item: T, filter: QueryFilter<T>): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if ((item as Record<string, unknown>)[key] !== value) {
      return false;
    }
  }
  return true;
}

/**
 * 基于 DocumentStorage 的集合句柄实现。
 */
class DocumentCollectionHandle<T> implements CollectionHandle<T> {
  constructor(
    private readonly storage: DocumentStorage,
    private readonly collection: string,
  ) {}

  list(): T[] {
    return this.storage.list<T>(this.collection);
  }

  get(id: string | number): T | undefined {
    return this.storage.get<T>(this.collection, id);
  }

  create(id: string | number, data: T): T {
    return this.storage.create<T>(this.collection, id, data);
  }

  update(id: string | number, data: Partial<T>): T | null {
    return this.storage.update<T>(this.collection, id, data);
  }

  delete(id: string | number): boolean {
    return this.storage.delete(this.collection, id);
  }

  query(filter: QueryFilter<T>): T[] {
    return this.storage.find<T>(this.collection, (item) => matchesFilter(item, filter));
  }

  count(): number {
    return this.storage.count(this.collection);
  }

  nextId(): number {
    return this.storage.nextId(this.collection);
  }
}

/**
 * 基于 DocumentStorage 的统一存储实现。
 *
 * 当未提供 IStorageEngine 时，所有集合使用 DocumentStorage 后端。
 * transaction 降级为直接执行（DocumentStorage 不支持跨集合事务）。
 */
class DocumentUnifiedStorage implements UnifiedStorage {
  private readonly doc: DocumentStorage;
  private readonly config: UnifiedStorageConfig;

  constructor(config: UnifiedStorageConfig) {
    this.config = config;
    this.doc = config.documentStorage ?? new MemoryDocumentStorage();
  }

  getCollection<T>(name: string): CollectionHandle<T> {
    return new DocumentCollectionHandle<T>(this.doc, name);
  }

  query<T>(collection: string, filter: QueryFilter<T>): T[] {
    return this.doc.find<T>(collection, (item) => matchesFilter(item, filter));
  }

  transaction<T>(work: () => T): T {
    // DocumentStorage 不支持跨集合事务，降级为直接执行
    return work();
  }

  healthCheck(): HealthCheckResult {
    try {
      // 简单写入 + 读取 + 删除测试
      const testCollection = '__health_check__';
      this.doc.create(testCollection, 0, { ok: true });
      this.doc.get(testCollection, 0);
      this.doc.delete(testCollection, 0);
      return { healthy: true, backend: 'document' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn('[UnifiedStorage] health check failed:', message);
      return { healthy: false, backend: 'document', message };
    }
  }

  getBackend(_collection: string): CollectionBackend {
    return 'document';
  }
}

/**
 * 基于 IStorageEngine 的集合句柄实现。
 *
 * 将 SQL 表映射为集合语义，每行需有 id 列。
 */
class SqlCollectionHandle<T> implements CollectionHandle<T> {
  constructor(
    private readonly engine: IStorageEngine,
    private readonly table: string,
  ) {}

  private get idCol(): string {
    return 'id';
  }

  list(): T[] {
    return this.engine.all<T>(`SELECT * FROM ${this.table}`);
  }

  get(id: string | number): T | undefined {
    return this.engine.get<T>(`SELECT * FROM ${this.table} WHERE ${this.idCol} = ?`, [id]);
  }

  create(id: string | number, data: T): T {
    const entries = Object.entries(data as Record<string, unknown>);
    const columns = entries.map(([k]) => k).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    this.engine.run(
      `INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`,
      entries.map(([, v]) => v),
    );
    return data;
  }

  update(id: string | number, data: Partial<T>): T | null {
    const existing = this.get(id);
    if (!existing) return null;
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return existing;
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    this.engine.run(
      `UPDATE ${this.table} SET ${setClause} WHERE ${this.idCol} = ?`,
      [...entries.map(([, v]) => v), id],
    );
    return { ...existing, ...data };
  }

  delete(id: string | number): boolean {
    const result = this.engine.run(
      `DELETE FROM ${this.table} WHERE ${this.idCol} = ?`,
      [id],
    );
    return result.changes > 0;
  }

  query(filter: QueryFilter<T>): T[] {
    const entries = Object.entries(filter as Record<string, unknown>);
    if (entries.length === 0) return this.list();
    const whereClause = entries.map(([k]) => `${k} = ?`).join(' AND ');
    return this.engine.all<T>(
      `SELECT * FROM ${this.table} WHERE ${whereClause}`,
      entries.map(([, v]) => v),
    );
  }

  count(): number {
    const row = this.engine.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${this.table}`);
    return row?.cnt ?? 0;
  }

  nextId(): number {
    // IStorageEngine 不直接支持自增 id 查询，使用 MAX(id) + 1 作为近似
    const row = this.engine.get<{ maxId: number | null }>(
      `SELECT MAX(${this.idCol}) as maxId FROM ${this.table}`,
    );
    return (row?.maxId ?? 0) + 1;
  }
}

/**
 * 混合后端统一存储实现。
 *
 * 根据配置将不同集合路由到 DocumentStorage 或 IStorageEngine。
 */
class HybridUnifiedStorage implements UnifiedStorage {
  private readonly doc: DocumentStorage | undefined;
  private readonly sql: IStorageEngine | undefined;
  private readonly collectionBackends: Record<string, CollectionBackend>;
  private readonly defaultBackend: CollectionBackend;

  constructor(config: UnifiedStorageConfig) {
    this.doc = config.documentStorage;
    this.sql = config.sqlEngine;
    this.collectionBackends = config.collectionBackends ?? {};
    this.defaultBackend = config.defaultBackend ?? 'document';
  }

  getBackend(collection: string): CollectionBackend {
    return this.collectionBackends[collection] ?? this.defaultBackend;
  }

  getCollection<T>(name: string): CollectionHandle<T> {
    const backend = this.getBackend(name);
    if (backend === 'sql' && this.sql) {
      return new SqlCollectionHandle<T>(this.sql, name);
    }
    if (backend === 'document' && this.doc) {
      return new DocumentCollectionHandle<T>(this.doc, name);
    }
    // 回退：如果有 doc 就用 doc，否则报错
    if (this.doc) {
      return new DocumentCollectionHandle<T>(this.doc, name);
    }
    throw new Error(`[UnifiedStorage] no backend available for collection "${name}"`);
  }

  query<T>(collection: string, filter: QueryFilter<T>): T[] {
    return this.getCollection<T>(collection).query(filter);
  }

  transaction<T>(work: () => T): T {
    // 如果有 SQL 引擎且所有操作可能在 SQL 端，使用 SQL 事务
    if (this.sql) {
      return this.sql.transaction(work);
    }
    // DocumentStorage 无跨集合事务，降级为直接执行
    return work();
  }

  healthCheck(): HealthCheckResult {
    const results: HealthCheckResult[] = [];

    if (this.doc) {
      try {
        const testCollection = '__health_check__';
        this.doc.create(testCollection, 0, { ok: true });
        this.doc.get(testCollection, 0);
        this.doc.delete(testCollection, 0);
        results.push({ healthy: true, backend: 'document' });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ healthy: false, backend: 'document', message });
      }
    }

    if (this.sql) {
      try {
        this.sql.all('SELECT 1 as ok');
        results.push({ healthy: true, backend: 'sql' });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ healthy: false, backend: 'sql', message });
      }
    }

    // 所有后端健康才算健康
    const allHealthy = results.length > 0 && results.every((r) => r.healthy);
    const primary = results[0];

    if (results.length === 0) {
      return { healthy: false, backend: this.defaultBackend, message: 'no backend configured' };
    }

    return {
      healthy: allHealthy,
      backend: primary.backend,
      message: results.map((r) => `${r.backend}: ${r.healthy ? 'ok' : r.message}`).join('; '),
    };
  }
}

// ---------------------------------------------------------------------------
// 工厂函数
// ---------------------------------------------------------------------------

/**
 * 创建统一存储实例。
 *
 * @param config 配置对象，指定后端实例和集合路由
 * @returns UnifiedStorage 实例
 *
 * @example
 * ```ts
 * // 仅文档存储（内存）
 * const storage = createUnifiedStorage({
 *   documentStorage: new MemoryDocumentStorage(),
 * });
 *
 * // 混合后端
 * const storage = createUnifiedStorage({
 *   documentStorage: WmsFileStorage.getInstance(),
 *   sqlEngine: new SQLiteEngine('/path/to/db'),
 *   collectionBackends: {
 *     warehouses: 'document',
 *     audit_logs: 'sql',
 *   },
 * });
 * ```
 */
export function createUnifiedStorage(config: UnifiedStorageConfig): UnifiedStorage {
  const hasDoc = config.documentStorage !== undefined;
  const hasSql = config.sqlEngine !== undefined;

  if (hasDoc && hasSql) {
    return new HybridUnifiedStorage(config);
  }

  if (hasDoc && !hasSql) {
    return new DocumentUnifiedStorage(config);
  }

  if (!hasDoc && hasSql) {
    // 仅 SQL 后端：用 HybridUnifiedStorage，所有集合走 SQL
    return new HybridUnifiedStorage({ ...config, defaultBackend: 'sql' });
  }

  // 无后端配置：默认内存文档存储
  return new DocumentUnifiedStorage({
    ...config,
    documentStorage: new MemoryDocumentStorage(),
  });
}
