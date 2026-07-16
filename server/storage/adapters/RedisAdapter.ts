// ============================================================================
// storage/adapters/RedisAdapter.ts — Redis 适配器
//
// 实现 IStorageEngine，以 Redis 为后端。
// 适用于缓存 / 会话 / 实时计数器等场景。
//
// 注意：Redis 是 KV 数据库，此适配器通过约定的 key 模式模拟关系型操作。
// 支持的操作集有限，主要用于缓存和简单 KV 场景。
// key 命名约定：{table}:{primaryKey} -> JSON序列化的行数据
//               {table}:__index__     -> SET of all primary keys
// ============================================================================

import { createRequire } from 'node:module';
import type { IStorageEngine, IPreparedStatement } from '../StorageEngine.js';

const basePath = typeof __filename !== 'undefined' ? __filename : 'file:///dummy.js';
const localRequire = createRequire(basePath);

// ---------------------------------------------------------------------------
// 类型：ioredis 驱动的最小类型子集
// ---------------------------------------------------------------------------

interface IORedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | null>;
  set(key: string, value: string, mode: string, duration: number): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  multi(): RedisMulti;
  status: string;
}

interface RedisMulti {
  get(key: string): RedisMulti;
  set(key: string, value: string): RedisMulti;
  del(...keys: string[]): RedisMulti;
  sadd(key: string, member: string): RedisMulti;
  srem(key: string, member: string): RedisMulti;
  incr(key: string): RedisMulti;
  exec(): Promise<unknown[]>;
}

// ---------------------------------------------------------------------------
// 工具：安全加载 ioredis 驱动
// ---------------------------------------------------------------------------

let ioredisModule: {
  default: new (url: string) => IORedisClient;
  Redis: new (url: string) => IORedisClient;
} | null = null;
let ioredisLoadError: string | null = null;

function loadIORedisDriver(): {
  default: new (url: string) => IORedisClient;
  Redis: new (url: string) => IORedisClient;
} {
  if (ioredisModule) return ioredisModule;
  if (ioredisLoadError) throw new Error(`Redis 驱动不可用: ${ioredisLoadError}`);
  try {
    const mod = localRequire('ioredis') as {
      default: new (url: string) => IORedisClient;
      Redis: new (url: string) => IORedisClient;
    };
    ioredisModule = mod;
    return ioredisModule;
  } catch (e) {
    ioredisLoadError = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Redis 驱动 (ioredis) 未安装。请执行: npm install ioredis\n` +
      `原始错误: ${ioredisLoadError}`,
    );
  }
}

// 仅供测试使用：重置驱动缓存
export function _resetRedisDriverCache(): void {
  ioredisModule = null;
  ioredisLoadError = null;
}

// ---------------------------------------------------------------------------
// RedisAdapter
// ---------------------------------------------------------------------------

export class RedisAdapter implements IStorageEngine {
  private client: IORedisClient | null = null;
  private url: string;
  private connected = false;
  private keyPrefix = 'storage:';
  private versionKey = '__schema_version__';
  private autoIncrementKey = '__auto_increment__';

  constructor(config: { url: string }) {
    this.url = config.url;
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }
    const ioredis = loadIORedisDriver();
    const RedisCtor = ioredis.default || ioredis.Redis;
    this.client = new RedisCtor(this.url);
    await this.client.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.client !== null && this.client.status === 'ready';
  }

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const client = this.client;
    const parsed = this.parseSql(sql);

    return {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
        throw new Error(
          'RedisAdapter.prepare.run 为异步操作，请使用异步形式调用',
        );
      },
      get<T>(...params: unknown[]): T | undefined {
        throw new Error(
          'RedisAdapter.prepare.get 为异步操作，请使用异步形式调用',
        );
      },
      all<T>(...params: unknown[]): T[] {
        throw new Error(
          'RedisAdapter.prepare.all 为异步操作，请使用异步形式调用',
        );
      },
    } as unknown as IPreparedStatement;
  }

  exec(sql: string): void {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    // 简单 DDL：CREATE TABLE 映射为创建索引集合
    const createMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?(\w+)"?/i);
    if (createMatch) {
      const table = createMatch[1];
      void this.client.sadd(this.tableIndexKey(table), '__init__');
      return;
    }
    throw new Error(`RedisAdapter.exec 不支持的 SQL: ${sql.slice(0, 100)}`);
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    throw new Error(
      'RedisAdapter.get 为异步操作，请使用 getAsync 方法',
    );
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    throw new Error(
      'RedisAdapter.all 为异步操作，请使用 allAsync 方法',
    );
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    throw new Error(
      'RedisAdapter.run 为异步操作，请使用 runAsync 方法',
    );
  }

  // ==========================================================================
  // 异步查询方法（Redis 天然异步）
  // ==========================================================================

  /**
   * 异步执行查询并获取单行。
   * 支持 SELECT ... FROM {table} WHERE pk = ? 形式的简单查询。
   */
  async getAsync<T extends Record<string, unknown>>(
    table: string,
    primaryKey: string | number,
  ): Promise<T | undefined> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const key = this.rowKey(table, String(primaryKey));
    const data = await this.client.get(key);
    if (!data) return undefined;
    try {
      return JSON.parse(data) as T;
    } catch {
      return undefined;
    }
  }

  /** 异步获取表中所有行 */
  async allAsync<T extends Record<string, unknown>>(table: string): Promise<T[]> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const indexKey = this.tableIndexKey(table);
    const members = await this.client.smembers(indexKey);
    const keys = members.filter((m) => m !== '__init__').map((pk) => this.rowKey(table, pk));
    if (keys.length === 0) return [];
    // 使用 pipeline 获取所有 key
    const multi = this.client.multi();
    keys.forEach((k) => multi.get(k));
    const results = await multi.exec();
    const rows: T[] = [];
    for (const result of results) {
      const val = result as string | null;
      if (val) {
        try {
          rows.push(JSON.parse(val) as T);
        } catch {
          // skip invalid
        }
      }
    }
    return rows;
  }

  /** 异步写入行（INSERT/UPDATE） */
  async runAsync(
    table: string,
    primaryKey: string | number,
    data: Record<string, unknown>,
    ttlSeconds?: number,
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const key = this.rowKey(table, String(primaryKey));
    const json = JSON.stringify(data);
    if (ttlSeconds) {
      await this.client.set(key, json, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, json);
    }
    await this.client.sadd(this.tableIndexKey(table), String(primaryKey));
    const id = Number(primaryKey) || 0;
    return { changes: 1, lastInsertRowid: id };
  }

  /** 异步删除行 */
  async deleteAsync(table: string, primaryKey: string | number): Promise<number> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const key = this.rowKey(table, String(primaryKey));
    const deleted = await this.client.del(key);
    await this.client.srem(this.tableIndexKey(table), String(primaryKey));
    return deleted;
  }

  /** 异步自增 ID */
  async nextIdAsync(table: string): Promise<number> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    return this.client.incr(`${this.keyPrefix}${table}:${this.autoIncrementKey}`);
  }

  // ==========================================================================
  // 事务
  // ==========================================================================

  transaction<T>(fn: () => T): T {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    throw new Error(
      'RedisAdapter.transaction 为异步操作，请使用 transactionAsync 方法',
    );
  }

  /**
   * 异步事务包装（基于 MULTI/EXEC）。
   * fn 接收一个 multi 对象用于批量操作。
   */
  async transactionAsync<T>(fn: (multi: RedisMulti) => Promise<T>): Promise<T> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const multi = this.client.multi();
    const result = await fn(multi);
    await multi.exec();
    return result;
  }

  // ==========================================================================
  // 迁移
  // ==========================================================================

  migrate(version: string, sql: string): void {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    throw new Error(
      'RedisAdapter.migrate 为异步操作，请使用 migrateAsync 方法',
    );
  }

  /** 异步版本化迁移 */
  async migrateAsync(version: string, sql: string): Promise<void> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    // 执行 SQL（仅支持 CREATE TABLE 语句）
    if (sql.trim()) {
      const statements = sql.split(';').filter((s) => s.trim());
      for (const stmt of statements) {
        this.exec(stmt);
      }
    }
    // 记录版本
    await this.client.set(
      `${this.keyPrefix}${this.versionKey}`,
      version,
    );
  }

  getVersion(): string {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    throw new Error(
      'RedisAdapter.getVersion 为异步操作，请使用 getVersionAsync 方法',
    );
  }

  /** 异步读取 schema 版本 */
  async getVersionAsync(): Promise<string> {
    if (!this.client) throw new Error('RedisAdapter: 未连接');
    const ver = await this.client.get(`${this.keyPrefix}${this.versionKey}`);
    return ver ?? '0.0.0';
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  private tableIndexKey(table: string): string {
    return `${this.keyPrefix}${table}:__index__`;
  }

  private rowKey(table: string, pk: string): string {
    return `${this.keyPrefix}${table}:${pk}`;
  }

  /**
   * 简易 SQL 解析器：提取表名和操作类型。
   * 仅用于诊断和错误提示，不用于实际执行。
   */
  private parseSql(sql: string): {
    type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'UNKNOWN';
    table?: string;
  } {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) {
      const match = sql.match(/FROM\s+"?(\w+)"?/i);
      return { type: 'SELECT', table: match?.[1] };
    }
    if (trimmed.startsWith('INSERT')) {
      const match = sql.match(/INTO\s+"?(\w+)"?/i);
      return { type: 'INSERT', table: match?.[1] };
    }
    if (trimmed.startsWith('UPDATE')) {
      const match = sql.match(/UPDATE\s+"?(\w+)"?/i);
      return { type: 'UPDATE', table: match?.[1] };
    }
    if (trimmed.startsWith('DELETE')) {
      const match = sql.match(/FROM\s+"?(\w+)"?/i);
      return { type: 'DELETE', table: match?.[1] };
    }
    if (trimmed.startsWith('CREATE')) {
      return { type: 'CREATE' };
    }
    return { type: 'UNKNOWN' };
  }
}
