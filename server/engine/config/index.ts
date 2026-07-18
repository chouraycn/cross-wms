export { validateConfig, resolveConfigSchema } from './schema.js';
export type { ConfigSchema, ConfigValidationError } from './schema.js';
export { resolveEnvVar, resolveEnvVars } from './env-vars.js';
export type { EnvVarBinding } from './env-vars.js';
export { resolveConfigPath, resolveDataDir, resolveConfigDir } from './paths.js';
export type { ConfigPaths } from './paths.js';
export { migrateLegacyConfig, detectLegacyConfig } from './legacy.js';
export type { LegacyConfigResult } from './legacy.js';

export {
  runConfigMigration,
  needsConfigMigration,
  getConfigMigrationStatus,
  getCurrentConfigVersion,
  readConfigVersion,
  writeConfigVersion,
  initConfigVersion,
} from './config-migration.js';
export type { ConfigVersion } from './config-migration.js';

export {
  createSnapshot,
  getSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  getVersionHistoryStats,
  compareSnapshots,
  setMaxSnapshots,
  readVersionHistory,
  writeVersionHistory,
} from './config-versioning.js';
export type { ConfigSnapshot, ConfigVersionHistory } from './config-versioning.js';

export {
  createBackup,
  deleteBackup,
  listBackups,
  getBackupMetadata,
  getBackupStats,
  validateBackup,
} from './config-backup.js';
export type { BackupMetadata } from './config-backup.js';

export {
  restoreFromBackup,
  restoreConfigFile,
  restoreSessions,
  cleanupPreRestoreBackups,
  restoreFromExternalPath,
} from './config-restore.js';

export * as sessions from './sessions/index.js';
export {
  SessionStore,
  getSessionStore,
  SessionStoreWriter,
  SessionStoreCache,
  SessionStoreMaintenance,
  SessionAccessor,
  Transcript,
  getTranscript,
  TranscriptStream,
  SessionLifecycle,
  CleanupService,
  DiskBudgetManager,
  SessionMetadataManager,
  SessionTargetsManager,
  SessionGoalsManager,
  SessionArtifactsManager,
  ThreadInfoManager,
  generateSessionId,
  generateSessionKey,
  resolveSessionPaths,
  ensureSessionDirs,
  sessionFileExists,
  archivedSessionFileExists,
  readSessionFile,
  readArchivedSessionFile,
  writeSessionFileAtomic,
  appendToSessionFile,
  deleteSessionFile,
  deleteArchivedSessionFile,
  moveSessionToArchive,
  moveSessionFromArchive,
  listSessionFiles,
  listArchivedSessionFiles,
  readSessionFirstLine,
  rewriteSessionFirstLine,
  rotateSessionFile,
  needsRotation,
  loadRegistry,
  saveRegistry,
  rebuildRegistry,
  updateRegistryEntry,
  removeRegistryEntry,
  findRegistryEntries,
  getRegistryStats,
  readTranscriptJSONL,
  readTranscriptJSONLPaged,
  writeTranscriptJSONL,
  appendToTranscriptJSONL,
  appendManyToTranscriptJSONL,
  getMessageCountJSONL,
  searchTranscriptJSONL,
  appendMessage,
  appendMessages,
  createAppendBuffer,
  AppendBuffer,
  createTranscriptHeader,
  validateTranscriptHeader,
  parseTranscriptHeader,
  resetAllSessions,
  resetSession,
  createNewSessionAsReset,
  softResetSession,
  runMigrations,
  needsMigration,
  getCurrentSchemaVersion,
} from './sessions/index.js';
export type {
  SessionStatus,
  SessionMetadata,
  SessionData,
  SessionGoal,
  SessionArtifact,
  SessionTarget,
  ThreadInfo,
  TranscriptMessage,
  TranscriptMessageRole,
  SessionStoreConfig,
  SessionStoreStats,
  DiskBudgetConfig,
  DiskBudgetStatus,
  LifecycleConfig,
  LifecycleStats,
  CleanupConfig,
  CleanupResult,
  ResetOptions,
  ResetResult,
  SessionListOptions,
  SessionListResult,
  SessionKey,
  SessionFileInfo,
  StoreWriteResult,
  SessionPaths,
  TranscriptHeader,
  TranscriptReadResult,
  AppendResult,
  RotationConfig,
  RotationResult,
  SessionRegistry,
  RegistryEntry,
  TranscriptFormat,
  TranscriptWriteMode,
} from './sessions/index.js';

// ===================== 配置 Schema 验证体系 =====================
// 新增模块：zod-schema、merge-patch、materialize、validation、schema-base、schema-meta
// 使用命名空间导出以避免与现有 schema.ts 的 validateConfig / ConfigSchema 命名冲突

export * as zodSchema from './zod-schema.js';
export * as mergePatch from './merge-patch.js';
export * as materialize from './materialize.js';
export * as validation from './validation.js';
export * as schemaBase from './schema-base.js';
export * as schemaMeta from './schema-meta.js';

// ===================== 移植自 openclaw 的配置模块 =====================
// 以下命名空间导出对应从 openclaw/src/config 移植的低依赖文件，
// 避免与已有具名导出冲突。

// 配置版本守卫与未来版本拦截
export * as futureVersionGuard from './future-version-guard.js';
// 危险名称匹配检测
export * as dangerousNameMatching from './dangerous-name-matching.js';
// 遗留配置规则契约（共享）
export * as legacyShared from './legacy.shared.js';
// Gateway Control UI 源解析
export * as gatewayControlUiOrigins from './gateway-control-ui-origins.js';
// Plugin allowlist 规范化
export * as pluginsAllowlist from './plugins-allowlist.js';
// 配置值环境变量替换
export * as envSubstitution from './env-substitution.js';
// 配置环境变量元数据与保留规则
export * as configEnvVars from './config-env-vars.js';
// Plugin web-search 配置解析
export * as pluginWebSearchConfig from './plugin-web-search-config.js';
// Plugin install 配置迁移
export * as pluginInstallConfigMigration from './plugin-install-config-migration.js';

// 配置 $include 指令解析（模块化配置）
export * as includes from './includes.js';

// 配置 include 图扫描
export * as includesScan from './includes-scan.js';

// State-directory dotenv 加载
export * as stateDirDotEnv from './state-dir-dotenv.js';
