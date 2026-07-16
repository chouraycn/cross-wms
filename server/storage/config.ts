// ============================================================================
// storage/config.ts — 存储后端配置类型定义
//
// 双层存储架构的配置入口：上层代码通过 StorageConfig 描述所需的
// 后端类型及连接参数，工厂函数据此实例化对应的 IStorageEngine。
// ============================================================================

import { AppPaths } from '../config/appPaths.js';

/** 支持的存储后端类型 */
export type StorageBackend = 'sqlite' | 'redis' | 'postgres' | 'lancedb' | 'qdrant';

/**
 * 存储配置。
 * backend 指定引擎类型，其余字段为对应后端的连接参数，
 * 仅当 backend 匹配时对应的配置才会被读取。
 */
export interface StorageConfig {
  /** 后端类型 */
  backend: StorageBackend;

  /** SQLite 本地文件数据库 */
  sqlite?: {
    /** 数据库文件路径（含文件名），如 /data/app.db */
    path: string;
  };

  /** Redis 内存 / 缓存数据库 */
  redis?: {
    /** 连接 URL，如 redis://localhost:6379 */
    url: string;
  };

  /** PostgreSQL 关系数据库 */
  postgres?: {
    /** 连接字符串，如 postgresql://user:pass@localhost:5432/db */
    connectionString: string;
  };

  /** LanceDB 向量 / 列式数据库 */
  lancedb?: {
    /** 数据集 URI，如 /data/lance或 s3://bucket/path */
    uri: string;
  };

  /** Qdrant 向量数据库 */
  qdrant?: {
    /** 服务 URL，如 http://localhost:6333 */
    url: string;
    /** API 密钥（可选） */
    apiKey?: string;
  };
}

/**
 * 默认存储配置工厂。
 * 返回一个指向 <rootDir>/data/main.db 的 SQLite 配置。
 */
export function defaultStorageConfig(): StorageConfig {
  return {
    backend: 'sqlite',
    sqlite: { path: AppPaths.mainDbFile },
  };
}