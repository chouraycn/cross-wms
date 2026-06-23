// ============================================================================
// storage/adapters/LanceDBAdapter.ts — LanceDB 适配器骨架
//
// 实现 IStorageEngine，以 LanceDB（列式向量数据库）为后端。
// 适用于大规模向量检索与 Embedding 存储。
// ============================================================================

import type { IStorageEngine, IPreparedStatement } from 'server/storage/StorageEngine';

/**
 * LanceDB 存储引擎适配器。
 *
 * LanceDB 原生不提供 SQL 接口，此适配器将 SQL 语义映射为
 * LanceDB Table / Dataset 操作。
 */
export class LanceDBAdapter implements IStorageEngine {
  constructor(config: { uri: string }) {
    // TODO: 保存 URI，初始化 LanceDB 连接
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    throw new Error('LanceDBAdapter.connect not implemented');
  }

  async disconnect(): Promise<void> {
    throw new Error('LanceDBAdapter.disconnect not implemented');
  }

  isConnected(): boolean {
    throw new Error('LanceDBAdapter.isConnected not implemented');
  }

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    throw new Error('LanceDBAdapter.prepare not implemented');
  }

  exec(sql: string): void {
    throw new Error('LanceDBAdapter.exec not implemented');
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    throw new Error('LanceDBAdapter.get not implemented');
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    throw new Error('LanceDBAdapter.all not implemented');
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    throw new Error('LanceDBAdapter.run not implemented');
  }

  // ==========================================================================
  // 事务
  // ==========================================================================

  transaction<T>(fn: () => T): T {
    throw new Error('LanceDBAdapter.transaction not implemented');
  }

  // ==========================================================================
  // 迁移
  // ==========================================================================

  migrate(version: string, sql: string): void {
    throw new Error('LanceDBAdapter.migrate not implemented');
  }

  getVersion(): string {
    throw new Error('LanceDBAdapter.getVersion not implemented');
  }
}