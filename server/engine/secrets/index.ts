/**
 * Secrets 模块 - 密钥管理系统统一入口
 *
 * 子模块：
 *   types            - 类型定义
 *   encryption       - AES-256-GCM 加密 / 密钥派生 / 恒定时间比较 / 熵计算
 *   store            - SQLite 加密存储 / 索引 / 缓存失效
 *   provider         - Provider 抽象（env / file / encrypted / keychain / aliyun-kms / tencent-kms / exec）
 *   resolver         - 引用解析 / 模板展开 / 回退链
 *   validator        - 格式校验 / 强度评估 / 过期检查
 *   permission       - 作用域访问控制 / 最小权限
 *   redactor         - 日志/输出脱敏
 *   scanner          - 文件/代码扫描 / 泄露检测
 *   target-registry  - 声明式目标注册表
 *   runtime          - 运行时密钥访问 / 缓存 / 失效 / 统计
 *   audit            - 审计日志 / 变更历史 / 合规检查
 *   rotation         - 密钥轮换 / 自动轮换 / 回退
 *   manager          - 高层管理器（CRUD / 批量 / 导入导出）
 *   apply            - 计划生成 / 应用 / 回滚 / dry-run
 *
 * 国内适配：
 *   - 阿里云 KMS（AliyunKmsProvider + registerKmsAdapter）
 *   - 腾讯云 KMS（TencentKmsProvider + registerKmsAdapter）
 *
 * 使用示例：
 *   import { SecretsManager, SecretsRuntime } from './secrets/index.js';
 *   const manager = new SecretsManager({ registry });
 *   const runtime = new SecretsRuntime({ registry });
 */

// ============== 类型定义 ==============
export type {
  SecretProvider,
  SecretType,
  SecretScope,
  SecretRef,
  SecretMetadata,
  SecretValue,
  SecretRecord,
  CreateSecretRequest,
  UpdateSecretRequest,
  ResolvedSecret,
  SecretCacheEntry,
  SecretsRuntimeConfig,
  SecretsStats,
  SecretAccessLog,
  SecretAccessAction,
  SecretsAuditCode,
  SecretsAuditSeverity,
  SecretsAuditFinding,
  SecretsAuditStatus,
  SecretsAuditReport,
  SecretTarget,
  SecretPermission,
  SecretStrengthResult,
  RotationPolicy,
  RotationRecord,
  ProviderConfig,
  ProviderOptions,
  EnvProviderOptions,
  FileProviderOptions,
  KmsProviderOptions,
  ExecProviderOptions,
  SecretScanFinding,
  SecretScanResult,
  SecretPlanItem,
  SecretPlan,
  SecretApplyResult,
  SecretsManagerOptions,
} from './types.js';

// ============== 加密 ==============
export {
  encrypt,
  decrypt,
  reencrypt,
  generateKey,
  getMasterKey,
  constantTimeEqual,
  shannonEntropy,
  deriveKeyWithPbkdf2,
  deriveKeyWithHkdf,
} from './encryption.js';
export type { EncryptedPayload } from './encryption.js';

// ============== 存储 ==============
export {
  initSecretsStore,
  onCacheInvalidate,
  clearSecretsStoreForTests,
  createSecret,
  getSecret,
  getSecretValue,
  getSecretValueByKey,
  updateSecret,
  deleteSecret,
  secretExists,
  listSecrets,
  logSecretAccess,
  getSecretAccessLogs,
  cleanupExpiredSecrets,
  markRotated,
} from './store.js';

// ============== Provider ==============
export {
  ProviderRegistry,
  EnvProvider,
  FileProvider,
  EncryptedProvider,
  KeychainProvider,
  AliyunKmsProvider,
  TencentKmsProvider,
  ExecProvider,
  createDefaultProviderRegistry,
  registerKmsAdapter,
  clearKmsAdapters,
} from './provider.js';
export type { KmsAdapter, ISecretProvider } from './provider.js';

// ============== 解析器 ==============
export {
  resolveSecretRef,
  resolveSecretRefAsync,
  resolveSecretRefs,
  resolveSecretRefsAsync,
  resolveWithFallback,
  resolveTemplate,
  extractSecretRefs,
  isTemplate,
  getProvider,
  // 注意：resolver.ts 的 validateSecretRef(ref, registry) 通过 Provider 校验存在性
  //       validator.ts 的 validateSecretRef(ref) 校验格式
  //       为避免冲突，resolver 版本以 validateSecretRefViaProvider 导出
  validateSecretRef as validateSecretRefViaProvider,
} from './resolver.js';

// ============== 验证器 ==============
export {
  validateSecretRef,
  validateSecretValue,
  validateKey,
  assessStrength,
  isExpired,
  isExpiringSoon,
} from './validator.js';
export type { ValidationResult } from './validator.js';

// ============== 权限控制 ==============
export {
  PermissionChecker,
  buildLeastPrivilege,
  isScopeAllowed,
  getScopePriority,
} from './permission.js';

// ============== 脱敏 ==============
export {
  SecretRedactor,
  createDefaultRedactor,
  redactPartial,
  DEFAULT_REDACTION_RULES,
} from './redactor.js';
export type { RedactionRule } from './redactor.js';

// ============== 扫描器 ==============
export {
  SecretScanner,
  createDefaultScanner,
} from './scanner.js';

// ============== 目标注册表 ==============
export {
  getCoreSecretTargetRegistry,
  getSecretTargetRegistry,
  listAuditableSecretTargets,
  listPlanableSecretTargets,
  getSecretTargetsByType,
  getSecretTargetById,
  isKnownSecretTargetId,
  resolveConfigSecretTargetByPath,
  getProviderIdFromPath,
  clearSecretTargetRegistryCache,
} from './target-registry.js';

// ============== 运行时 ==============
export {
  SecretsRuntime,
  isResolvedFromCache,
  DEFAULT_RUNTIME_CACHE_TTL_MS,
} from './runtime.js';
export type { SecretsRuntimeOptions } from './runtime.js';

// ============== 审计 ==============
export {
  queryAccessLogs,
  queryChangeHistory,
  runComplianceAudit,
  generateAuditReport,
  filterBySeverity,
  filterByCode,
  countFindings,
  isAuditPassed,
  getSecretHistory,
  getAccessStats,
  listAllSecretsForAudit,
} from './audit.js';
export type { AuditOptions } from './audit.js';

// ============== 轮换 ==============
export {
  initRotationStore,
  clearRotationStoreForTests,
  registerRotationPolicy,
  unregisterRotationPolicy,
  listRotationPolicies,
  getRotationPolicy,
  clearRotationPolicies,
  rotateSecret,
  autoRotateSecret,
  scheduledRotateSecret,
  getRotationHistory,
  getAllRotationRecords,
  rollbackRotation,
  findSecretsNeedingRotation,
  getRotationStats,
} from './rotation.js';

// ============== 管理器 ==============
export {
  SecretsManager,
  createSecretsManager,
  validateSecretRefFormat,
  generateSecretId,
} from './manager.js';
export type {
  SecretImportItem,
  SecretImportResult,
  SecretExportItem,
  BatchResult,
} from './manager.js';

// ============== 应用 ==============
export {
  planSecrets,
  applyPlan,
  rollbackApply,
  clearApplyBackups,
  formatPlan,
  formatApplyResult,
} from './apply.js';
export type {
  DesiredSecretItem,
  PlanOptions,
  ApplyOptions,
} from './apply.js';

// ============== 兼容性导出（保留旧 API 入口） ==============
// 注意：以下导出保留向后兼容，新代码建议直接使用本模块的细分 API。
// 为避免与子模块导出冲突，此处不再 re-export 旧 secretsManager.ts 的 API。

// ============== 渠道密钥面运行时 ==============
// 来自 openclaw/src/secrets/ 的渠道密钥面运行时：
//   - basic / tts / collector 三个渠道密钥收集器
//   - core / channels / plugins / tts 四个运行时配置收集器
//   - 以及总入口 collectConfigAssignments
// ============== 渠道密钥收集器 ==============
export {
  collectConditionalChannelFieldAssignments,
  collectNestedChannelFieldAssignments,
  collectSimpleChannelFieldAssignments,
  getChannelRecord,
  getChannelSurface,
  hasConfiguredSecretInputValue,
  isBaseFieldActiveForChannelSurface,
  normalizeSecretStringValue,
  resolveChannelAccountSurface,
} from './channel-secret-basic-runtime.js';
export type {
  ChannelAccountEntry,
  ChannelAccountPredicate,
  ChannelAccountSurface,
} from './channel-secret-basic-runtime.js';

export { collectNestedChannelTtsAssignments } from './channel-secret-tts-runtime.js';

// 渠道密钥收集器 barrel（channel-secret-collector-runtime.ts）
// 内部已从 channel-secret-basic-runtime / channel-secret-tts-runtime 聚合导出，
// 上方已经直接 re-export 了具体符号，避免重复声明。

// ============== 运行时配置收集器 ==============
export { collectTtsApiKeyAssignments } from './runtime-config-collectors-tts.js';
export { collectCoreConfigAssignments } from './runtime-config-collectors-core.js';
export { collectChannelConfigAssignments } from './runtime-config-collectors-channels.js';
export { collectPluginConfigAssignments } from './runtime-config-collectors-plugins.js';
export { collectConfigAssignments } from './runtime-config-collectors.js';

// ============== 运行时共享类型与工具 ==============
// 来自 openclaw/src/secrets/runtime-shared.ts：解析器上下文 / 分配 / 警告 helpers
export {
  createResolverContext,
  pushAssignment,
  pushWarning,
  pushInactiveSurfaceWarning,
  collectSecretInputAssignment,
  applyResolvedAssignments,
  hasOwnProperty,
  isEnabledFlag,
  isChannelAccountEffectivelyEnabled,
} from './runtime-shared.js';
export type {
  SecretResolverWarningCode,
  SecretResolverWarning,
  SecretAssignment,
  ResolverContext,
  SecretDefaults,
} from './runtime-shared.js';

// ============== Gateway 认证面状态评估 ==============
// 来自 openclaw/src/secrets/runtime-gateway-auth-surfaces.ts：评估 gateway 凭据 SecretRef 面
export {
  GATEWAY_AUTH_SURFACE_PATHS,
  evaluateGatewayAuthSurfaceStates,
} from './runtime-gateway-auth-surfaces.js';
export type {
  GatewayAuthSurfacePath,
  GatewayAuthSurfaceState,
  GatewayAuthSurfaceStateMap,
} from './runtime-gateway-auth-surfaces.js';

// ============== 渠道密钥契约 API ==============
// 来自 openclaw/src/secrets/channel-contract-api.ts：从 bundled/external plugin artifacts 加载合约
export {
  loadBundledChannelSecretContractApi,
  loadChannelSecretContractApi,
  loadChannelSecretContractApiForRecord,
  loadBundledChannelSecurityContractApi,
} from './channel-contract-api.js';
export type {
  BundledChannelSecretContractApi,
  BundledChannelSecurityContractApi,
} from './channel-contract-api.js';

// ============== 解析后值校验 ==============
// 来自 openclaw/src/secrets/secret-value.ts：解析后 SecretRef 值的形状校验
export {
  isExpectedResolvedSecretValue,
  hasConfiguredPlaintextSecretValue,
  assertExpectedResolvedSecretValue,
} from './secret-value.js';
export type { SecretExpectedResolvedValue } from './secret-value.js';
