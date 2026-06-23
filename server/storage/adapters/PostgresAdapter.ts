// ============================================================================
// storage/adapters/PostgresAdapter.ts — PostgreSQL 适配器骨架
//
// 实现 IStorageEngine，以 PostgreSQL 为后端。
// 适用于生产环境多进程共享数据场景。
// ============================================================================

import type { IStorageEngine, IPreparedStatement } from 'server/storage/StorageEngine';

/**
 * PostgreSQL 存储引擎适配器。
 *
 * 底层可选用 pg（node-postgres）或 pg-promise 驱动。
 * 连接池由构造函数参数注入，适配器负责获取 / 释放连接。
 */
export class PostgresAdapter implements IStorageEngine {
  constructor(config: { connectionString: string }) {
    // TODO: 保存连接字符串，初始化连接池
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    throw new Error('PostgresAdapter.connect not implemented');
  }

  async disconnect(): Promise<void> {
    throw new Error('PostgresAdapter.disconnect not implemented');
  }

  isConnected(): boolean {
    throw new Error('PostgresAdapter.isConnected not implemented');
  }

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    throw new Error('PostgresAdapter.prepare not implemented');
  }

  exec(sql: string): void {
    throw new Error('PostgresAdapter.exec not implemented');
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    throw new Error('PostgresAdapter.get not implemented');
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    throw new Error('PostgresAdapter.all not implemented');
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    throw new Error('PostgresAdapter.run not implemented');
  }

  // ==========================================================================
  // 事务
  // ==========================================================================

  transaction<T>(fn: () => T): T {
    throw new Error('PostgresAdapter.transaction not implemented');
  }

  // ==========================================================================
  // 迁移
  // ==========================================================================

  migrate(version: string, sql: string): void {
    throw new Error('PostgresAdapter.migrate not implemented');
  }

  getVersion(): string {
    throw new Error('PostgresAdapter.getVersion not implemented');
  }
}