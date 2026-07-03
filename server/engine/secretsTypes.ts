/**
 * 密钥管理类型定义
 *
 * 定义密钥引用、存储值、提供者类型等核心类型
 */

/**
 * 密钥提供者类型
 */
export type SecretProvider = 'env' | 'file' | 'encrypted' | 'keychain';

/**
 * 密钥引用 - 用于引用存储的密钥
 */
export interface SecretRef {
  /** 密钥提供者 */
  provider: SecretProvider;
  /** 密钥标识符 */
  key: string;
  /** 密钥类型 */
  type?: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other';
}

/**
 * 密钥存储值
 */
export interface SecretValue {
  /** 密钥 ID */
  id: string;
  /** 密钥提供者 */
  provider: SecretProvider;
  /** 密钥标识符 */
  key: string;
  /** 密钥类型 */
  type: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other';
  /** 加密后的值（Base64 编码） */
  valueEncrypted: string;
  /** 创建时间（Unix 时间戳，毫秒） */
  createdAt: number;
  /** 更新时间（Unix 时间戳，毫秒） */
  updatedAt: number;
  /** 元数据 */
  metadata?: {
    /** 描述 */
    description?: string;
    /** 过期时间（Unix 时间戳，毫秒） */
    expiresAt?: number;
    /** 最后访问时间 */
    lastAccessedAt?: number;
    /** 访问次数 */
    accessCount?: number;
  };
}

/**
 * 密钥访问日志条目
 */
export interface SecretAccessLog {
  /** 日志 ID */
  id: string;
  /** 密钥 ID */
  secretId: string;
  /** 访问时间（Unix 时间戳，毫秒） */
  accessedAt: number;
  /** 访问来源（如：agent_id, user_id, service_name） */
  source: string;
  /** 访问操作类型 */
  action: 'read' | 'write' | 'delete';
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如有） */
  errorMessage?: string;
}

/**
 * 密钥创建请求
 */
export interface CreateSecretRequest {
  /** 密钥提供者 */
  provider: SecretProvider;
  /** 密钥标识符 */
  key: string;
  /** 密钥值（明文） */
  value: string;
  /** 密钥类型 */
  type?: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other';
  /** 描述 */
  description?: string;
  /** 过期时间（Unix 时间戳，毫秒） */
  expiresAt?: number;
}

/**
 * 密钥更新请求
 */
export interface UpdateSecretRequest {
  /** 密钥值（明文） */
  value?: string;
  /** 密钥类型 */
  type?: 'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other';
  /** 描述 */
  description?: string;
  /** 过期时间（Unix 时间戳，毫秒） */
  expiresAt?: number;
}

/**
 * 密钥解析结果
 */
export interface ResolvedSecret {
  /** 密钥引用 */
  ref: SecretRef;
  /** 解析后的值 */
  value: string;
  /** 来源提供者 */
  source: SecretProvider;
  /** 解析时间 */
  resolvedAt: number;
}

/**
 * 密钥缓存条目
 */
export interface SecretCacheEntry {
  /** 解析后的值 */
  value: string;
  /** 缓存时间 */
  cachedAt: number;
  /** 过期时间 */
  expiresAt?: number;
}

/**
 * 密钥运行时配置快照
 */
export interface SecretsRuntimeConfig {
  /** 当前激活的密钥引用列表 */
  activeSecrets: SecretRef[];
  /** 快照时间 */
  snapshotTime: number;
  /** 会话 ID */
  sessionId: string;
}

/**
 * 密钥统计信息
 */
export interface SecretsStats {
  /** 总密钥数量 */
  totalSecrets: number;
  /** 按提供者统计 */
  byProvider: Record<SecretProvider, number>;
  /** 按类型统计 */
  byType: Record<string, number>;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 密钥审计代码
 */
export type SecretsAuditCode =
  | 'PLAINTEXT_FOUND'
  | 'REF_UNRESOLVED'
  | 'REF_SHADOWED'
  | 'LEGACY_RESIDUE'
  | 'EXPIRED_SECRET'
  | 'UNUSED_SECRET';

/**
 * 密钥审计严重级别
 */
export type SecretsAuditSeverity = 'info' | 'warn' | 'error';

/**
 * 密钥审计发现
 */
export interface SecretsAuditFinding {
  code: SecretsAuditCode;
  severity: SecretsAuditSeverity;
  file: string;
  jsonPath: string;
  message: string;
  provider?: string;
  key?: string;
}

/**
 * 密钥审计状态
 */
export type SecretsAuditStatus = 'clean' | 'findings' | 'unresolved';

/**
 * 密钥审计报告
 */
export interface SecretsAuditReport {
  version: number;
  status: SecretsAuditStatus;
  filesScanned: string[];
  summary: {
    plaintextCount: number;
    unresolvedRefCount: number;
    shadowedRefCount: number;
    legacyResidueCount: number;
    expiredCount: number;
    unusedCount: number;
  };
  findings: SecretsAuditFinding[];
}

/**
 * 密钥目标类型
 */
export interface SecretTarget {
  id: string;
  targetType: string;
  configFile: string;
  pathPattern: string;
  refPathPattern?: string;
  secretShape: 'secret_input' | 'sibling_ref';
  expectedResolvedValue: 'string' | 'string-or-object';
  includeInPlan: boolean;
  includeInConfigure: boolean;
  includeInAudit: boolean;
  providerIdPathSegmentIndex?: number;
  trackProviderShadowing?: boolean;
}