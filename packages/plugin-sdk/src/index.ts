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
  PluginManifestModelSupport,
  PluginManifestModelCatalog,
  PluginManifestActivation,
  PluginManifestSetup,
  PluginManifestContracts,
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