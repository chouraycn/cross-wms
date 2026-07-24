export {
  validateConfig,
  resolveConfigSchema,
  mergeObjectSchema,
  lookupConfigSchema,
  buildConfigSchema,
  resetConfigSchemaCache,
} from './schema.js';
export type {
  ConfigSchema,
  ConfigValidationError,
  ConfigUiHint,
  ConfigUiHints,
  ConfigSchemaResponse,
  ConfigSchemaReloadKind,
  ConfigSchemaLookupChild,
  ConfigSchemaLookupResult,
  PluginUiMetadata,
  ChannelUiMetadata,
} from './schema.js';
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

// ===================== 移植 stub（v4.0 — openclaw 降级 stub 批量移植） =====================
export * from './agent-dirs.js';
export * from './allowed-values.js';
export * from './backup-rotation.js';
export * from './bindings.js';
export * from './bundled-channel-config-metadata.generated.js';
export * from './cache-utils.js';
export * from './channel-capabilities.js';
export * from './channel-compat-normalization.js';
// export * from './channel-config-metadata.js';  // removed: TS2308 conflict
export * from './channel-configured-shared.js';
export * from './channel-configured.js';
export * from './codex-plugin-diagnostics.js';
export * from './combined-store-gateway.js';
// export * from './commands.flags.js';  // removed: TS2308 conflict
export * from './commands.js';
export * from './compaction-session-file.js';
export * from './config-env-vars.js';
export * from './config-paths.js';
// export * from './config.js';  // removed: TS2308 conflict
export * from './context-visibility.js';
export * from './dangerous-name-matching.js';
export * from './defaults.js';
export * from './delivery-info.js';
export * from './doc-baseline.runtime.js';
export * from './doc-baseline.js';
export * from './env-preserve.js';
// export * from './env-substitution.js';  // removed: TS2308 conflict
export * from './exec-command-highlighting.js';
export * from './explicit-session-key-normalization.js';
export * from './future-version-guard.js';
export * from './gateway-control-ui-origins.js';
export * from './gateway-dispatch-config.js';
export * from './group-policy.js';
export * from './group.js';
// export * from './home-env.test-harness.js';  // removed: TS2308 conflict
export * from './inbound.runtime.js';
export * from './includes-scan.js';
// export * from './includes.js';  // removed: TS2308 conflict
export * from './io.audit.js';
export * from './io.clobber-snapshot.js';
export * from './io.health-state.js';
export * from './io.invalid-config.js';
export * from './io.meta.js';
export * from './io.observe-recovery.js';
export * from './io.observe-suspicious.js';
export * from './io.owner-display-secret.js';
// export * from './io.js';  // removed: TS2308 conflict
export * from './io.write-prepare.js';
export * from './issue-format.js';
export * from './legacy.shared.js';
export * from './logging.js';
export * from './main-session.runtime.js';
// export * from './markdown-tables.js';  // removed: TS2308 conflict
export * from './markdown-tables.types.js';
export * from './mcp-config-normalize.js';
export * from './mcp-config.js';
export * from './media-audio-field-metadata.js';
export * from './model-input.js';
export * from './model-override-provenance.js';
// export * from './mutate.js';  // removed: TS2308 conflict
export * from './mutation-conflict.js';
export * from './nix-mode-write-guard.js';
export * from './normalize-exec-safe-bin.js';
export * from './normalize-paths.js';
export * from './patch-replace-paths.js';
// export * from './plugin-auto-enable.apply.js';  // removed: TS2308 conflict
// export * from './plugin-auto-enable.detect.js';  // removed: TS2308 conflict
export * from './plugin-auto-enable.prefer-over.js';
// export * from './plugin-auto-enable.shared.js';  // removed: TS2308 conflict
// export * from './plugin-auto-enable.js';  // removed: TS2308 conflict
export * from './plugin-auto-enable.types.js';
export * from './plugin-host-cleanup.js';
export * from './plugin-install-config-migration.js';
export * from './plugin-web-search-config.js';
export * from './plugins-allowlist.js';
export * from './provider-policy.js';
export * from './read-best-effort-config.runtime.js';
export * from './recovery-policy.js';
export * from './redact-snapshot.raw.js';
export * from './redact-snapshot.secret-ref.js';
export * from './redact-snapshot.js';
export * from './reset-preserved-selection.js';
export * from './runtime-group-policy.js';
export * from './runtime-overrides.js';
export * from './runtime-schema.js';
export * from './runtime-snapshot.js';
export * from './runtime-source-projection.js';
export * from './runtime-types.js';
export * from './schema.help.js';
// export * from './schema.hints.js';  // removed: TS2308 conflict
export * from './schema.labels.js';
export * from './schema.shared.js';
export * from './schema.tags.js';
export * from './sensitive-paths.js';
// export * from './sessions.js';  // removed: TS2308 conflict
export * from './shell-env-expected-keys.js';
export * from './silent-reply.js';
export * from './skill-prompt-blobs.js';
export * from './startup-migration.js';
export * from './state-dir-dotenv.js';
export * from './store-entry-shape.js';
export * from './store-entry.js';
export * from './store-load.js';
export * from './store-maintenance-operations.js';
export * from './store-maintenance-preserve.js';
export * from './store-maintenance-runtime.js';
export * from './store-writer-state.js';
export * from './store.runtime.js';
export * from './talk-defaults.js';
export * from './talk.js';
export * from './test-helpers.js';
// export * from './transcript-file-resolve.js';  // removed: TS2308 conflict
export * from './transcript-mirror.js';
export * from './transcript-replay.js';
export * from './transcript-resolve.runtime.js';
export * from './transcript.runtime.js';
export * from './types.access-groups.js';
export * from './types.acp.js';
export * from './types.agent-defaults.js';
export * from './types.agents-shared.js';
export * from './types.agents.js';
export * from './types.approvals.js';
export * from './types.auth.js';
export * from './types.base.js';
// export * from './types.bot-loop-protection.js';  // removed: TS2308 conflict
export * from './types.browser.js';
// export * from './types.channel-health.js';  // removed: TS2308 conflict
export * from './types.channel-messaging-common.js';
export * from './types.channels.js';
export * from './types.cli.js';
export * from './types.commitments.js';
export * from './types.crestodian.js';
export * from './types.cron.js';
export * from './types.discord.js';
export * from './types.gateway.js';
export * from './types.googlechat.js';
export * from './types.hooks.js';
export * from './types.imessage.js';
export * from './types.installs.js';
export * from './types.irc.js';
export * from './types.mcp.js';
export * from './types.memory.js';
export * from './types.messages.js';
export * from './types.models.js';
export * from './types.msteams.js';
export * from './types.node-host.js';
export * from './types.openclaw.js';
export * from './types.plugins.js';
export * from './types.provider-request.js';
export * from './types.queue.js';
export * from './types.sandbox.js';
export * from './types.secrets.js';
export * from './types.signal.js';
export * from './types.skills.js';
export * from './types.slack.js';
export * from './types.telegram.js';
export * from './types.tools.js';
export * from './types.tts.js';
export * from './types.whatsapp.js';
export * from './zod-schema-agent-defaults.js';
export * from './zod-schema-agent-model.js';
export * from './zod-schema-agent-runtime.js';
export * from './zod-schema-agents.js';
export * from './zod-schema-allowdeny.js';
export * from './zod-schema-approvals.js';
export * from './zod-schema-channels-config.js';
export * from './zod-schema-channels.js';
export * from './zod-schema-core.js';
export * from './zod-schema-hooks.js';
export * from './zod-schema-installs.js';
export * from './zod-schema-providers-core.js';
export * from './zod-schema-providers-googlechat.js';
export * from './zod-schema-providers-whatsapp.js';
export * from './zod-schema-proxy.js';
export * from './zod-schema-secret-input-validation.js';
export * from './zod-schema-sensitive.js';
export * from './zod-schema-session.js';
