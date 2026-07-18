/**
 * 密钥管理类型定义
 *
 * 定义密钥核心领域模型：Secret、SecretMetadata、SecretScope、SecretRef 等。
 * 作为 secrets 模块内部统一类型契约，供 store / manager / resolver / runtime 等子模块共享。
 */

/** 密钥提供者类型（含国内云 KMS） */
export type SecretProvider =
  | 'env'
  | 'file'
  | 'encrypted'
  | 'keychain'
  | 'aliyun-kms'
  | 'tencent-kms'
  | 'exec';

/** 密钥类型 */
export type SecretType =
  | 'api_key'
  | 'password'
  | 'token'
  | 'certificate'
  | 'ssh_key'
  | 'other';

/** 密钥作用域 — 最小权限控制的核心维度 */
export type SecretScope =
  | 'global'
  | 'agent'
  | 'session'
  | 'channel'
  | 'plugin';

/** 密钥引用 — 用于引用存储的密钥 */
export interface SecretRef {
  provider: SecretProvider;
  key: string;
  type?: SecretType;
  scope?: SecretScope;
  scopeId?: string;
}

/** 密钥元数据 */
export interface SecretMetadata {
  description?: string;
  expiresAt?: number;
  lastAccessedAt?: number;
  accessCount?: number;
  tags?: string[];
  rotationPolicyId?: string;
  lastRotatedAt?: number;
}

/** 密钥存储值（含加密后的值） */
export interface SecretValue {
  id: string;
  provider: SecretProvider;
  key: string;
  type: SecretType;
  valueEncrypted: string;
  createdAt: number;
  updatedAt: number;
  metadata?: SecretMetadata;
  scope?: SecretScope;
  scopeId?: string;
}

/** 不含明文/密文的密钥记录（用于列表/导出） */
export type SecretRecord = Omit<SecretValue, 'valueEncrypted'>;

/** 密钥创建请求 */
export interface CreateSecretRequest {
  provider: SecretProvider;
  key: string;
  value: string;
  type?: SecretType;
  description?: string;
  expiresAt?: number;
  tags?: string[];
  scope?: SecretScope;
  scopeId?: string;
}

/** 密钥更新请求 */
export interface UpdateSecretRequest {
  value?: string;
  type?: SecretType;
  description?: string;
  expiresAt?: number;
  tags?: string[];
}

/** 解析后的密钥 */
export interface ResolvedSecret {
  ref: SecretRef;
  value: string;
  source: SecretProvider;
  resolvedAt: number;
  cached: boolean;
}

/** 缓存条目 */
export interface SecretCacheEntry {
  value: string;
  cachedAt: number;
  expiresAt?: number;
}

/** 运行时配置快照 */
export interface SecretsRuntimeConfig {
  activeSecrets: SecretRef[];
  snapshotTime: number;
  sessionId: string;
}

/** 密钥统计信息 */
export interface SecretsStats {
  totalSecrets: number;
  byProvider: Record<string, number>;
  byType: Record<string, number>;
  cacheHitRate: number;
  lastUpdated: number;
}

/** 访问日志条目 */
export interface SecretAccessLog {
  id: string;
  secretId: string;
  accessedAt: number;
  source: string;
  action: SecretAccessAction;
  success: boolean;
  errorMessage?: string;
}

/** 访问操作类型 */
export type SecretAccessAction = 'read' | 'write' | 'delete' | 'rotate' | 'export';

/** 审计代码 */
export type SecretsAuditCode =
  | 'PLAINTEXT_FOUND'
  | 'REF_UNRESOLVED'
  | 'REF_SHADOWED'
  | 'LEGACY_RESIDUE'
  | 'EXPIRED_SECRET'
  | 'UNUSED_SECRET'
  | 'WEAK_SECRET'
  | 'PERMISSION_DENIED';

/** 审计严重级别 */
export type SecretsAuditSeverity = 'info' | 'warn' | 'error';

/** 审计发现 */
export interface SecretsAuditFinding {
  code: SecretsAuditCode;
  severity: SecretsAuditSeverity;
  file: string;
  jsonPath: string;
  message: string;
  provider?: string;
  key?: string;
}

/** 审计状态 */
export type SecretsAuditStatus = 'clean' | 'findings' | 'unresolved';

/** 审计报告 */
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
    weakCount: number;
  };
  findings: SecretsAuditFinding[];
}

/** 密钥目标 */
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

/** 权限主体 */
export interface SecretPermission {
  scope: SecretScope;
  scopeId?: string;
  actions: SecretAccessAction[];
  provider?: SecretProvider;
}

/** 密钥强度评估结果 */
export interface SecretStrengthResult {
  score: number;
  level: 'weak' | 'fair' | 'good' | 'strong';
  issues: string[];
}

/** 密钥轮换策略 */
export interface RotationPolicy {
  id: string;
  name: string;
  intervalMs: number;
  maxAgeMs?: number;
  notifyBeforeMs?: number;
  enabled: boolean;
}

/** 轮换记录 */
export interface RotationRecord {
  id: string;
  secretId: string;
  rotatedAt: number;
  previousValueLength: number;
  newValueLength: number;
  trigger: 'manual' | 'auto' | 'scheduled';
  success: boolean;
  error?: string;
}

/** Provider 配置 */
export interface ProviderConfig {
  type: SecretProvider;
  options: ProviderOptions;
}

/** Provider 选项（联合类型） */
export type ProviderOptions =
  | EnvProviderOptions
  | FileProviderOptions
  | KmsProviderOptions
  | ExecProviderOptions;

export interface EnvProviderOptions {
  env?: NodeJS.ProcessEnv;
}

export interface FileProviderOptions {
  baseDir?: string;
}

export interface KmsProviderOptions {
  region?: string;
  keyId?: string;
  endpoint?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
}

export interface ExecProviderOptions {
  command: string;
  timeoutMs?: number;
  cwd?: string;
}

/** 密钥扫描发现 */
export interface SecretScanFinding {
  type: 'plaintext' | 'high_entropy' | 'known_pattern';
  file: string;
  line: number;
  column?: number;
  match: string;
  redacted: string;
  severity: SecretsAuditSeverity;
}

/** 密钥扫描结果 */
export interface SecretScanResult {
  filesScanned: number;
  findings: SecretScanFinding[];
  scannedAt: number;
}

/** 密钥变更计划项 */
export interface SecretPlanItem {
  action: 'create' | 'update' | 'delete';
  key: string;
  provider: SecretProvider;
  newValue?: string;
  currentValueLength?: number;
  description?: string;
}

/** 密钥变更计划 */
export interface SecretPlan {
  planId: string;
  createdAt: number;
  items: SecretPlanItem[];
  summary: { creates: number; updates: number; deletes: number; total: number };
  hasDestructiveChanges: boolean;
}

/** Apply 结果 */
export interface SecretApplyResult {
  planId: string;
  appliedAt: number;
  results: Array<{
    key: string;
    action: SecretPlanItem['action'];
    success: boolean;
    error?: string;
  }>;
  succeeded: number;
  failed: number;
}

/** 密钥管理器选项 */
export interface SecretsManagerOptions {
  defaultScope?: SecretScope;
  enableCache?: boolean;
  cacheTtlMs?: number;
  enableAudit?: boolean;
}
