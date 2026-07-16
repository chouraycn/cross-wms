// ============================================================================
// storage/adapters/QdrantAdapter.ts — Qdrant 向量数据库适配器
//
// 实现 IStorageEngine，以 Qdrant 为后端。
// 适用于语义检索与高精度相似度匹配场景。
//
// 注意：Qdrant 是向量数据库，不是关系数据库。此适配器将部分 SQL 语义
// 映射为 Qdrant 的 Collection + Filter + Vector 搜索。主要面向向量检索
// 场景，不支持复杂 SQL 查询。
// ============================================================================

import type { IStorageEngine, IPreparedStatement } from '../StorageEngine.js';

// ---------------------------------------------------------------------------
// 类型：Qdrant REST API 返回的最小类型子集
// ---------------------------------------------------------------------------

interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

interface QdrantSearchResult {
  id: string | number;
  version: number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: number[];
}

interface QdrantCollectionInfo {
  name: string;
  points_count: number;
  vectors_count: number;
  status: string;
}

interface QdrantApiResponse<T> {
  result: T;
  status: string;
  time: number;
}

// ---------------------------------------------------------------------------
// QdrantAdapter
// ---------------------------------------------------------------------------

export class QdrantAdapter implements IStorageEngine {
  private baseUrl: string;
  private apiKey?: string;
  private connected = false;

  constructor(config: { url: string; apiKey?: string }) {
    this.baseUrl = config.url.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    // 通过 health check 验证连接
    try {
      const resp = await this.request<{ health: string }>('/healthz', 'GET');
      if (resp.health !== 'ok') {
        throw new Error(`Qdrant health check failed: ${resp.health}`);
      }
      this.connected = true;
    } catch (e) {
      throw new Error(
        `Qdrant 连接失败 (${this.baseUrl}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    // REST API 无状态，无需显式断开
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ==========================================================================
  // 向量操作（核心功能）
  // ==========================================================================

  /**
   * 创建一个向量集合。
   * @param collectionName 集合名
   * @param vectorSize 向量维度
   * @param distance 距离度量方式
   */
  async createCollection(
    collectionName: string,
    vectorSize: number,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine',
  ): Promise<void> {
    await this.request(`/collections/${collectionName}`, 'PUT', {
      vectors: {
        size: vectorSize,
        distance,
      },
    });
  }

  /** 删除集合 */
  async deleteCollection(collectionName: string): Promise<void> {
    await this.request(`/collections/${collectionName}`, 'DELETE');
  }

  /** 获取集合信息 */
  async getCollectionInfo(collectionName: string): Promise<QdrantCollectionInfo> {
    const resp = await this.request<QdrantCollectionInfo>(
      `/collections/${collectionName}`,
      'GET',
    );
    return resp;
  }

  /** 列出所有集合 */
  async listCollections(): Promise<string[]> {
    const resp = await this.request<{ collections: { name: string }[] }>(
      '/collections',
      'GET',
    );
    return resp.collections.map((c) => c.name);
  }

  /**
   * 插入或更新向量点。
   * @param collectionName 集合名
   * @param points 点列表
   */
  async upsertPoints(
    collectionName: string,
    points: QdrantPoint[],
  ): Promise<{ operationId: number; status: string }> {
    const resp = await this.request<{ operation_id: number; status: string }>(
      `/collections/${collectionName}/points?wait=true`,
      'PUT',
      { points },
    );
    return { operationId: resp.operation_id, status: resp.status };
  }

  /**
   * 向量相似度搜索。
   * @param collectionName 集合名
   * @param vector 查询向量
   * @param limit 返回数量
   * @param filter 过滤条件
   * @param withPayload 是否返回 payload
   * @param withVector 是否返回向量
   */
  async search(
    collectionName: string,
    vector: number[],
    limit = 10,
    filter?: Record<string, unknown>,
    withPayload = true,
    withVector = false,
  ): Promise<QdrantSearchResult[]> {
    const resp = await this.request<QdrantSearchResult[]>(
      `/collections/${collectionName}/points/search`,
      'POST',
      {
        vector,
        limit,
        filter,
        with_payload: withPayload,
        with_vector: withVector,
      },
    );
    return resp;
  }

  /** 根据 ID 获取点 */
  async getPoint(
    collectionName: string,
    id: string | number,
  ): Promise<QdrantPoint | undefined> {
    try {
      const resp = await this.request<QdrantPoint>(
        `/collections/${collectionName}/points/${id}`,
        'GET',
      );
      return resp;
    } catch {
      return undefined;
    }
  }

  /** 删除点 */
  async deletePoints(
    collectionName: string,
    ids: (string | number)[],
  ): Promise<{ operationId: number; status: string }> {
    const resp = await this.request<{ operation_id: number; status: string }>(
      `/collections/${collectionName}/points/delete?wait=true`,
      'POST',
      { points: ids },
    );
    return { operationId: resp.operation_id, status: resp.status };
  }

  /** 按过滤条件删除点 */
  async deletePointsByFilter(
    collectionName: string,
    filter: Record<string, unknown>,
  ): Promise<{ operationId: number; status: string }> {
    const resp = await this.request<{ operation_id: number; status: string }>(
      `/collections/${collectionName}/points/delete?wait=true`,
      'POST',
      { filter },
    );
    return { operationId: resp.operation_id, status: resp.status };
  }

  /** 获取集合点数量 */
  async countPoints(
    collectionName: string,
    filter?: Record<string, unknown>,
  ): Promise<number> {
    const resp = await this.request<{ count: number }>(
      `/collections/${collectionName}/points/count`,
      'POST',
      filter ? { filter } : {},
    );
    return resp.count;
  }

  /** 滚动浏览所有点（分页遍历） */
  async scrollPoints(
    collectionName: string,
    limit = 100,
    filter?: Record<string, unknown>,
  ): Promise<QdrantPoint[]> {
    const allPoints: QdrantPoint[] = [];
    let nextPageOffset: string | number | null = null;
    // 防止死循环：最多滚动 100 页
    let page = 0;
    const maxPages = 100;

    while (page < maxPages) {
      page += 1;
      const body: Record<string, unknown> = { limit, with_payload: true, with_vector: true };
      if (nextPageOffset !== null) {
        body.offset = nextPageOffset;
      }
      if (filter) {
        body.filter = filter;
      }
      const resp = await this.request<{
        points: QdrantPoint[];
        next_page_offset: string | number | null;
      }>(
        `/collections/${collectionName}/points/scroll`,
        'POST',
        body,
      );
      allPoints.push(...resp.points);
      nextPageOffset = resp.next_page_offset;
      if (nextPageOffset === null || nextPageOffset === undefined) {
        break;
      }
    }
    return allPoints;
  }

  // ==========================================================================
  // IStorageEngine 接口实现（部分）
  //
  // Qdrant 是向量数据库，不支持 SQL。以下方法提供最小兼容实现，
  // 用于满足 IStorageEngine 接口契约。实际使用应调用上面的
  // 向量专属方法（search / upsertPoints / ...）。
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    throw new Error(
      'QdrantAdapter 不支持 SQL 预编译。请使用向量专属方法: search / upsertPoints / ...',
    );
  }

  exec(sql: string): void {
    // 支持 CREATE COLLECTION 语法：
    // CREATE COLLECTION IF NOT EXISTS <name> WITH VECTOR SIZE <n> DISTANCE <Cosine|Euclid|Dot>
    const createMatch = sql.match(
      /CREATE\s+COLLECTION\s+IF\s+NOT\s+EXISTS\s+"?(\w+)"?\s+WITH\s+VECTOR\s+SIZE\s+(\d+)\s+DISTANCE\s+(Cosine|Euclid|Dot)/i,
    );
    if (createMatch) {
      const name = createMatch[1];
      const size = parseInt(createMatch[2], 10);
      const distance = createMatch[3] as 'Cosine' | 'Euclid' | 'Dot';
      void this.createCollection(name, size, distance);
      return;
    }
    throw new Error(`QdrantAdapter.exec 不支持的语句: ${sql.slice(0, 100)}`);
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    throw new Error(
      'QdrantAdapter 不支持 SQL 查询。请使用向量专属方法: search / getPoint / ...',
    );
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    throw new Error(
      'QdrantAdapter 不支持 SQL 查询。请使用向量专属方法: search / scrollPoints / ...',
    );
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    throw new Error(
      'QdrantAdapter 不支持 SQL 写入。请使用向量专属方法: upsertPoints / deletePoints / ...',
    );
  }

  transaction<T>(fn: () => T): T {
    throw new Error('QdrantAdapter 不支持事务（向量数据库无 ACID 事务语义）');
  }

  migrate(version: string, sql: string): void {
    throw new Error(
      'QdrantAdapter.migrate 为异步操作，请使用 migrateAsync 方法',
    );
  }

  /** 异步版本化迁移（记录版本到 meta collection） */
  async migrateAsync(version: string, migrationSql: string): Promise<void> {
    // 执行迁移 SQL（如 CREATE COLLECTION 语句）
    if (migrationSql.trim()) {
      const statements = migrationSql.split(';').filter((s) => s.trim());
      for (const stmt of statements) {
        this.exec(stmt);
      }
    }
    // 确保 meta collection 存在
    try {
      await this.getCollectionInfo('_schema_meta');
    } catch {
      await this.createCollection('_schema_meta', 1, 'Cosine');
    }
    // 写入版本信息（作为一个特殊 point）
    await this.upsertPoints('_schema_meta', [
      {
        id: 'schema_version',
        vector: [0],
        payload: { version },
      },
    ]);
  }

  getVersion(): string {
    throw new Error(
      'QdrantAdapter.getVersion 为异步操作，请使用 getVersionAsync 方法',
    );
  }

  /** 异步读取 schema 版本 */
  async getVersionAsync(): Promise<string> {
    try {
      const point = await this.getPoint('_schema_meta', 'schema_version');
      return (point?.payload?.version as string) ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  /**
   * 发送 Qdrant REST API 请求。
   */
  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      let errText = '';
      try {
        errText = await resp.text();
      } catch {
        errText = resp.statusText;
      }
      throw new Error(`Qdrant API ${method} ${path} 失败 (${resp.status}): ${errText}`);
    }

    const data = (await resp.json()) as QdrantApiResponse<T>;
    return data.result;
  }
}
