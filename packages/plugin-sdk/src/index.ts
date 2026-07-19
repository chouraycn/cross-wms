export type {
  PluginType,
  PluginStatus,
  PluginHookType,
  PluginManifest,
  PluginInstance,
  PluginActivationContext,
  PluginApi,
  ToolDefinition,
  ToolHandler,
  ToolContext,
  HookHandler,
  HookContext,
  HookResult,
  PluginLogger,
  PluginContract,
  ContractMethod,
  ProviderRegistration,
  MemoryBackendRegistration,
  ChannelPluginRegistration,
  SkillRegistration,
  EmbeddingProviderRegistration,
  CompactionProviderRegistration,
  PluginCapabilityKind,
  PluginToolCapability,
  PluginToolContext,
  PluginProviderCapability,
  PluginEmbeddingProviderCapability,
  PluginEmbeddingRuntime,
  PluginMemoryHostCapability,
  PluginMemoryHostRuntime,
  PluginMemoryEntry,
  PluginMemorySearchOptions,
  PluginMemorySearchResult,
  PluginMemoryHostStats,
  PluginChannelCapability,
  PluginChannelMessage,
  PluginChannelReply,
  PluginChannelSendResult,
  PluginHookCapability,
  PluginHookContext,
  PluginHookResult,
  PluginCommandCapability,
  PluginCommandContext,
  PluginServiceCapability,
  PluginServiceContext,
  PluginAudioProviderCapability,
  PluginImageGenerationCapability,
  PluginVideoGenerationCapability,
  PluginWebSearchCapability,
  PluginSecurityProviderCapability,
  PluginApiIntegrationCapability,
  PluginCapability,
  RegistrationMode,
  PluginConfigSchemaField,
  PluginConfigSchema,
  PluginRuntimeLifecycleRegistration,
  PluginLifecycleContext,
  PluginRuntimeStatus,
  PluginDefinition,
  ExtendedPluginManifest,
  PluginRuntime,
  PluginRegistryStats,
  PluginSlotKey,
  HookFailurePolicy,
  HookRunOptions,
  HookRunnerLogger,
  AdapterCompatConfig,
} from './types';

export {
  emptyPluginConfigSchema,
} from './types';

export {
  ContractRegistry,
  contractRegistry,
  defineContract,
  implementsContract,
} from './contracts';

export type {
  ContractRegistryEvents,
} from './contracts';

export {
  HookRunner,
  PluginHookRunner,
  hookRunner,
  onHook,
  offHook,
} from './hooks';

export type {
  HookMergeStrategy,
  HookRegistration,
  HookRunnerEvents,
} from './hooks';

export {
  ToolRegistry,
  toolRegistry,
  defineTool,
  registerTool,
  unregisterTool,
} from './tools';

export type {
  ToolRegistryEvents,
} from './tools';

export {
  createPluginLogger,
  createNoopLogger,
  LogCollector,
} from './logger';

export type {
  LogLevel,
} from './logger';

export {
  definePluginEntry,
} from './plugin-entry';

export type {
  DefinePluginEntryOptions,
  DefinedPluginEntry,
} from './plugin-entry';

export {
  UnifiedPluginRegistry,
  getUnifiedPluginRegistry,
} from './plugin-registry';

export type {
  UnifiedPluginRegistryEvents,
  UnifiedPluginRegistryOptions,
  ToolRegistryAdapter,
} from './plugin-registry';

export {
  Slots,
  slots,
  normalizeKinds,
  hasKind,
  kindsEqual,
  slotKeysForPluginKind,
  defaultSlotIdForKey,
  applyExclusiveSlotSelection,
} from './slots';

export type {
  SlotSelectionResult,
} from './slots';

export {
  ManifestValidator,
  validateManifest,
  normalizeManifest,
  loadManifestFromPath,
  compareManifests,
  discoverPlugins,
} from './manifest';

export type {
  PluginManifestModelSupport,
  PluginManifestModelCatalog,
  PluginManifestActivation,
  PluginManifestSetup,
  PluginManifestContracts,
  PluginManifestValidationResult,
} from './manifest';

// ==================== 高级契约模块导出 ====================

export {
  ChannelRuntime,
  channelRuntime,
} from './channel-runtime';

export type {
  ChannelRuntimeEvents,
} from './channel-runtime';

export {
  ApprovalRuntime,
  approvalRuntime,
} from './approval-runtime';

export type {
  ApprovalRuntimeEvents,
} from './approval-runtime';

export {
  MemoryCore,
  memoryCore,
} from './memory-core';

export type {
  MemoryCoreEvents,
  MemoryCoreConfig,
} from './memory-core';

export {
  ProviderStream,
  providerStream,
} from './provider-stream';

export type {
  ProviderStreamEvents,
} from './provider-stream';

export {
  ReplyPipeline,
  replyPipeline,
} from './reply-pipeline';

export type {
  ReplyPipelineEvents,
} from './reply-pipeline';

export {
  SecretProvider,
  secretProvider,
} from './secret-provider';

export type {
  SecretProviderEvents,
} from './secret-provider';

export {
  SecurityContext,
  createSecurityContext,
} from './security-context';

export type {
  SecurityContextEvents,
} from './security-context';

// 导出新增的类型
export type {
  ChannelState,
  ChannelConfig,
  ChannelSupports,
  Channel,
  ApprovalPolicy,
  ApprovalResult,
  ApprovalRequest,
  AuditLogEntry,
  AuditLogger,
  MemoryEntry,
  MemoryQuery,
  Usage,
  StreamMessage,
  StreamConfig,
  StreamChunk,
  ReplyMessage,
  Reply,
  PipelineStage,
  PipelineContext,
  SecretConfig,
  SecretStatus,
  Permission,
  SecurityPolicy,
  SecurityContextConfig,
} from './types';

// ==================== 从 openclaw 移植的模块导出 ====================
// 注意：部分模块因依赖未移植而内容被注释，对应导出也需注释

// export * from './browser-config';  // 模块内容被注释，无导出
// export * from './config-runtime';  // 模块依赖未移植，无导出
// export * from './exec-approvals-runtime';  // 模块内容被注释，无导出
export * from './gateway-method-runtime';
export * from './outbound-media';
// export * from './plugin-runtime';  // 模块内容被注释，无导出
export * from './provider-auth-runtime';
export * from './provider-auth';
export * from './provider-entry';
// export * from './provider-http';  // 模块内容被注释，无导出
export * from './provider-model-shared';
// export * from './provider-model-types';  // 模块内容被注释，无导出
export * from './provider-onboard';
export * from './provider-stream-shared';
export * from './provider-tools';
// export * from './provider-web-search-config-contract';  // 模块内容被注释，无导出
export * from './provider-web-search';
// export * from './runtime-doctor';  // 模块内容被注释，无导出
// export * from './runtime-env';  // 模块内容被注释，无导出
export * from './secret-input';
export * from './security-runtime';
// export * from './testing';  // 模块内容被注释，无导出
// export * from './text-runtime';  // 模块内容被注释，无导出
export * from './video-generation';