// ============================================================================
// storage/index.ts — 存储层统一导出入口
//
// 提供所有类型、类、工厂函数的集中导出。
// 上层代码通过 import { ... } from 'server/storage' 即可使用全部能力。
// ============================================================================

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------
export type { StorageBackend, StorageConfig } from './config.js';

// ---------------------------------------------------------------------------
// 文档式存储统一接口（JSON / 集合语义，与 SQL 的 IStorageEngine 互补）
// ---------------------------------------------------------------------------
export type { DocumentStorage } from './DocumentStorage.js';
export { MemoryDocumentStorage } from './DocumentStorage.js';

// ---------------------------------------------------------------------------
// 引擎接口
// ---------------------------------------------------------------------------
export type { IStorageEngine, IPreparedStatement } from './StorageEngine.js';

// ---------------------------------------------------------------------------
// SQLite 默认实现
// ---------------------------------------------------------------------------
export { SQLiteEngine, createSQLiteEngine } from './SQLiteEngine.js';

// ---------------------------------------------------------------------------
// 第三方适配器（骨架 / 占位）
// ---------------------------------------------------------------------------
export { RedisAdapter } from './adapters/RedisAdapter.js';
export { PostgresAdapter } from './adapters/PostgresAdapter.js';
export { LanceDBAdapter } from './adapters/LanceDBAdapter.js';
export { QdrantAdapter } from './adapters/QdrantAdapter.js';

// ---------------------------------------------------------------------------
// 文件存储层
// ---------------------------------------------------------------------------
export { FileStorage } from './FileStorage.js';
import { WmsFileStorage } from './WmsFileStorage.js';
export { WmsFileStorage };

// ---------------------------------------------------------------------------
// 文档存储工厂：上层 DAO 通过统一入口获取后端，不再直接依赖具体实现
// ---------------------------------------------------------------------------
import type { DocumentStorage } from './DocumentStorage.js';
import { MemoryDocumentStorage } from './DocumentStorage.js';

/**
 * 创建文档式存储后端。
 * - 'file'（默认）：WmsFileStorage，落地 JSON 文件（生产 WMS 数据）
 * - 'memory'：内存实现，用于单测与轻量场景
 */
export function createDocumentStorage(kind: 'file' | 'memory' = 'file'): DocumentStorage {
  return kind === 'memory' ? new MemoryDocumentStorage() : WmsFileStorage.getInstance();
}

// ---------------------------------------------------------------------------
// 统一存储访问接口（聚合 DocumentStorage + IStorageEngine）
// ---------------------------------------------------------------------------
export type {
  UnifiedStorage,
  UnifiedStorageConfig,
  CollectionHandle,
  CollectionBackend,
  QueryFilter,
  HealthCheckResult,
} from './UnifiedStorage.js';
export { createUnifiedStorage } from './UnifiedStorage.js';

// ---------------------------------------------------------------------------
// Agent 向量索引
// ---------------------------------------------------------------------------
export { AgentVectorDB } from './AgentVectorDB.js';