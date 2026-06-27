// ============================================================================
// storage/adapters/QdrantAdapter.ts — Qdrant 适配器骨架
//
// 实现 IStorageEngine，以 Qdrant（向量数据库）为后端。
// 适用于语义检索与高精度相似度匹配。
// ============================================================================

import type { IStorageEngine, IPreparedStatement } from '../StorageEngine.js';

/**
 * Qdrant 向量数据库存储引擎适配器。
 *
 * 通过 REST / gRPC 接口操作 Qdrant Collection。
 * SQL 查询将被转换为 Qdrant 的 Filter + Vector 搜索。
 */
export class QdrantAdapter implements IStorageEngine {
  constructor(config: { url: string; apiKey?: string }) {
    // TODO: 保存连接参数，初始化 Qdrant 客户端
  }

  // ==========================================================================
  // 连接管理
  // ==========================================================================

  async connect(): Promise<void> {
    throw new Error('QdrantAdapter.connect not implemented');
  }

  async disconnect(): Promise<void> {
    throw new Error('QdrantAdapter.disconnect not implemented');
  }

  isConnected(): boolean {
    throw new Error('QdrantAdapter.isConnected not implemented');
  }

  // ==========================================================================
  // 通用查询
  // ==========================================================================

  prepare(sql: string): IPreparedStatement {
    throw new Error('QdrantAdapter.prepare not implemented');
  }

  exec(sql: string): void {
    throw new Error('QdrantAdapter.exec not implemented');
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    throw new Error('QdrantAdapter.get not implemented');
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    throw new Error('QdrantAdapter.all not implemented');
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number } {
    throw new Error('QdrantAdapter.run not implemented');
  }

  // ==========================================================================
  // 事务
  // ==========================================================================

  transaction<T>(fn: () => T): T {
    throw new Error('QdrantAdapter.transaction not implemented');
  }

  // ==========================================================================
  // 迁移
  // ==========================================================================

  migrate(version: string, sql: string): void {
    throw new Error('QdrantAdapter.migrate not implemented');
  }

  getVersion(): string {
    throw new Error('QdrantAdapter.getVersion not implemented');
  }
}