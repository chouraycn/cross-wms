/**
 * Secret (密钥) 类型定义
 *
 * 从 src/services/api.ts 提取的密钥相关类型，集中管理以便复用。
 * services/api.ts 通过 re-export 保持向后兼容。
 */

/** 密钥存储范围（与现有 provider 字段对应） */
// eslint-disable-next-line @typescript-eslint/ban-types
export type SecretScope = 'env' | 'file' | 'encrypted' | 'keychain' | (string & {});

/** 密钥元数据（对应原 services/api.ts 中的 SecretItemMetadata） */
export interface SecretItemMetadata {
  accessCount: number;
  lastAccessedAt?: number;
  description?: string;
  [key: string]: unknown;
}

/** 密钥条目（对应后端密钥记录） */
export interface SecretItem {
  id: string;
  provider: string;
  key: string;
  type?: string;
  createdAt: number;
  updatedAt: number;
  metadata: SecretMetadata;
}

/** 密钥访问日志 */
export interface SecretAccessLog {
  id: string;
  secretId: string;
  action: string;
  source: string;
  accessedAt: number;
  success: boolean;
  error?: string;
}

/** 密钥统计 */
export interface SecretsStats {
  totalSecrets: number;
  byProvider: Record<string, number>;
  byType: Record<string, number>;
  cacheHitRate: number;
  lastUpdated: number;
}

// ===================== 语义化别名 =====================

/** 密钥条目别名 */
export type Secret = SecretItem;

/** 密钥元数据别名 */
export type SecretMetadata = SecretItemMetadata;
