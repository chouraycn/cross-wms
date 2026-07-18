/**
 * Models 模块 — 模型提供商管理 barrel 导出
 *
 * 聚合所有模型相关子模块的公开 API，包括：
 * - Provider 注册表（modelProviderRegistry）
 * - 模型目录（modelCatalog）
 * - 模型元数据（modelMetadata）
 * - 故障转移（modelFailover）
 * - 运行时策略（modelRuntimePolicy）
 * - 模型解析（models）
 * - 模型认证体系（model-auth）
 * - 模型选择体系（model-selection）
 * - 模型目录管理（model-catalog-*）
 * - 模型发现和回退（model-discovery-*, model-fallback, model-suppression）
 * - 工具支持和传输（model-tool-support, model-transport-*）
 * - 运行时别名（model-runtime-aliases）
 */

// ==================== Provider 注册表 ====================
export {
  getAllProviders,
  getProviderById,
  registerProvider,
  unregisterProvider,
  getCatalogIndex,
} from "../modelProviderRegistry.js";

// ==================== 模型目录 ====================
export type {
  ModelCapability,
  ModelType,
  ThinkingLevel,
  ThinkingProfile,
  ModelPricing as CatalogModelPricing,
  ModelInfo,
  ProviderAuth,
  ModelCatalogIndex,
  ProviderInfo,
  ModelCatalogEntry,
  ModelSearchParams,
  ModelSearchResult,
} from "../modelCatalog.js";
export {
  getModelCatalogEntry,
  listModelCatalog,
  searchModelCatalog,
  findBestModel,
  updateModelAvailability,
  getProviders,
  getModelTypes,
  getCapabilities,
} from "../modelCatalog.js";

// ==================== 模型元数据 ====================
export type {
  ModelContextLimits,
  ModelPricing as MetadataModelPricing,
  ModelCapabilities,
  ModelMetadata,
} from "../modelMetadata.js";
export { getModelMetadataStore } from "../modelMetadata.js";

// ==================== 故障转移 ====================
export type {
  FailoverPolicy,
  ErrorCategory,
  ModelFailoverOptions,
} from "../modelFailover.js";
export {
  ModelFailoverManager,
  getModelFailoverManager,
} from "../modelFailover.js";

// ==================== 运行时策略 ====================
export type {
  PolicySource,
  RuntimePolicyConfig,
  ResolvedModelRuntimePolicy,
  ResolveModelRuntimePolicyParams,
} from "../modelRuntimePolicy.js";
export {
  resolveModelRuntimePolicy,
  needsAutoSelection,
  getPolicySummary,
} from "../modelRuntimePolicy.js";

// ==================== 模型解析 ====================
export type {
  ModelListResult,
  ModelAuthStatusResult,
  ModelResolveParams,
  ModelResolveResult,
} from "../models.js";
export {
  modelList,
  modelAuthStatus,
  modelResolve,
  getModelById,
  getAllModels,
  updateModelAuthStatus,
} from "../models.js";

// ==================== 模型认证体系 ====================

export type {
  AuthStatus,
  AuthSource,
  ResolvedProviderAuth,
  ResolvedModelAuth,
} from "./model-auth-runtime-shared.js";
export {
  ProviderAuthError,
  MissingProviderAuthError,
  isProviderAuthError,
  isMissingProviderAuthError,
  formatMissingAuthError,
  requireApiKey,
  safeLogAuthResult,
  resolveAwsSdkEnvVarName,
  createUnauthenticatedAuth,
  createPendingAuth,
  createAuthenticatedAuth,
  createErrorAuth,
} from "./model-auth-runtime-shared.js";

export type {
  EnvApiKeyResult,
  EnvApiKeyLookupOptions,
} from "./model-auth-env.js";
export {
  getDefaultEnvVarForProvider,
  getEnvCandidatesForProvider,
  resolveEnvApiKey,
  hasEnvApiKey,
  listConfiguredEnvProviders,
} from "./model-auth-env.js";

export type {
  ApiKeyLabel,
  KeyLabelManagerOptions,
} from "./model-auth-label.js";
export {
  ApiKeyLabelManager,
  getApiKeyLabelManager,
} from "./model-auth-label.js";

export {
  ENV_API_KEY_MARKERS,
  CUSTOM_LOCAL_AUTH_MARKER,
  NON_ENV_SECRETREF_MARKER,
  GCP_VERTEX_CREDENTIALS_MARKER,
  AWS_SDK_AUTH_MARKER,
  OAUTH_AUTH_MARKER,
  KEYCHAIN_AUTH_MARKER_PREFIX,
  isKnownEnvApiKeyMarker,
  isNonSecretApiKeyMarker,
  isKeychainAuthMarker,
  extractKeychainId,
  redactApiKey,
  isApiKeySensitive,
} from "./model-auth-markers.js";

export type {
  ProviderAuthStateEntry,
  AuthStateChangeListener,
  ProviderAuthStateStoreOptions,
} from "./model-provider-auth-state.js";
export {
  ProviderAuthStateStore,
  getProviderAuthStateStore,
} from "./model-provider-auth-state.js";

export type {
  ProviderAuthResolveOptions,
  ProviderAuthCheckResult,
} from "./model-provider-auth.js";
export {
  resolveProviderAuth,
  checkProviderAuth,
  hasProviderAuth,
  batchResolveProviderAuth,
  getAuthenticatedProviders,
  refreshAllProviderAuth,
  getProviderAuthSummary,
} from "./model-provider-auth.js";

export type {
  FallbackAuthStrategy,
  FallbackAuthOptions,
  FallbackAuthResult,
  ModelFallbackAuthResult,
} from "./model-fallback-auth.js";
export {
  resolveFallbackProviderAuth,
  findFirstAuthenticatedProvider,
  createFallbackAuthResult,
  getDefaultFallbackChain,
} from "./model-fallback-auth.js";

export type {
  ModelAuthResolveOptions,
  ModelAuthCheckResult,
} from "./model-auth.js";
export {
  resolveModelAuth,
  checkModelAuth,
  hasModelAuth,
  getModelAuthStatus,
  batchResolveModelAuth,
  getAuthenticatedModels,
  invalidateModelAuth,
  invalidateAllModelAuth,
  getModelAuthSummary,
} from "./model-auth.js";

// ==================== 模型选择体系 ====================

export type {
  ModelRef,
  ModelManifestNormalizationContext,
  ModelAliasIndex,
  ModelRefStatus,
  AllowedModelSet,
  ModelSelectionContext,
  ResolvedModelSelection,
  ModelResolveOptions,
  ModelDisplayInfo,
  DisplayGroup,
  CliModelPickerOptions,
  CliModelListOptions,
  PickerVisibilityState,
  VisibilityPolicyConfig,
  VisibilityContext,
  VisibilityPolicy,
  ThinkLevel,
} from "./model-selection.js";
export {
  parseModelRef,
  normalizeProviderId,
  normalizeModelId,
  modelKey,
  normalizeModelRef,
  isSameModelRef,
  buildModelAliasIndex,
  buildAllowedModelSetWithFallbacks,
  isModelAllowed,
  buildConfiguredAllowlistKeys,
  buildConfiguredModelCatalog,
  resolveAllowedModelRefFromAliasIndex,
  resolveModelRefFromString,
  normalizeModelSelection,
  resolveBareModelDefaultProvider,
  inferUniqueProviderFromCatalog,
  inferUniqueProviderFromConfiguredModels,
  getModelRefStatusWithFallbackModels,
  resolveConfiguredModelRef,
  resolveModelSelection,
  buildDisplayGroups,
  searchDisplayModels,
  formatContextWindow,
  getProviderDisplayName,
  getProviderCategory,
  formatModelListForCli,
  createModelPickerPrompt,
  groupModelsForCliDisplay,
  isCliProvider,
  isModelVisible,
  filterVisibleModels,
  createVisibilityPolicy,
  getModelPickerVisibilityManager,
  selectModel,
  getModelSelectionSummary,
} from "./model-selection.js";

export type {
  ModelLookupResult,
  CatalogLookupOptions,
} from "./model-catalog-lookup.js";
export {
  findModelById,
  findModelsByProvider,
  findModelsByCapability,
  findModelsByCapabilities,
  findModelsByName,
  findBestModelByContextWindow,
  searchCatalog,
  getModelLookupStats,
} from "./model-catalog-lookup.js";

export type {
  CatalogBrowseParams,
  CatalogBrowseResult,
  ProviderBrowseResult,
} from "./model-catalog-browse.js";
export {
  browseCatalog,
  browseProviders,
  getCatalogCategories,
  getCatalogCapabilities,
} from "./model-catalog-browse.js";

export type {
  CatalogScope,
  CatalogScopeEntry,
  CatalogScopeStack,
} from "./model-catalog-scope.js";
export {
  createScopeStack,
  pushScope,
  popScope,
  getScopeEntry,
  resolveScopedModelConfig,
  isModelVisibleInScopes,
  resolveDefaultModelFromScopes,
  mergeScopeOverrides,
  getScopePriority,
  compareScopePriority,
} from "./model-catalog-scope.js";

export type {
  CatalogStateEntry,
  CatalogStateCacheOptions,
} from "./model-catalog-state-cache.js";
export {
  CatalogStateCache,
  getCatalogStateCache,
} from "./model-catalog-state-cache.js";

export type {
  RuntimeCatalogModel,
  RuntimeCatalogProvider,
  RuntimeCatalogStats,
} from "./model-catalog-runtime.js";
export {
  RuntimeCatalog,
  getRuntimeCatalog,
  initializeRuntimeCatalogFromRegistry,
} from "./model-catalog-runtime.js";

// ==================== 模型发现和回退 ====================

export type {
  DiscoveryContext,
  DiscoveryConstraints,
  DiscoveryResult,
} from "./model-discovery-context.js";
export {
  createDiscoveryContext,
  mergeDiscoveryContext,
  extractConstraints,
  applyDiscoveryFilters,
  getDiscoveryContextSummary,
} from "./model-discovery-context.js";

export type {
  SuppressionReason,
  SuppressedModelEntry,
  ModelSuppressionOptions,
} from "./model-suppression.js";
export {
  ModelSuppressionManager,
  getModelSuppressionManager,
} from "./model-suppression.js";

export type {
  FallbackStrategy,
  FallbackOptions,
  FallbackResult,
  ModelWithFallback,
} from "./model-fallback.js";
export {
  findFallbackModel,
  buildFallbackChain,
  getFallbackStrategyDescription,
} from "./model-fallback.js";

// ==================== 工具支持和传输 ====================

export type {
  ToolSupportLevel,
  ToolCapabilities,
  ToolSupportInfo,
} from "./model-tool-support.js";
export {
  getToolSupportInfo,
  supportsToolCalling,
  supportsParallelToolCalls,
  supportsStreamingToolCalls,
  supportsJsonMode,
  getToolSupportLevel,
  filterModelsByToolSupport,
  setModelToolOverride,
  setProviderToolSupport,
} from "./model-tool-support.js";

export type {
  ModelTransportUrlConfig,
  ResolvedTransportUrl,
} from "./model-transport-url.js";
export {
  getTransportUrlConfig,
  resolveChatUrl,
  resolveStreamingChatUrl,
  resolveModelsListUrl,
  resolveEmbeddingsUrl,
  setProviderBaseUrl,
  supportsStreaming,
  getBaseUrl,
} from "./model-transport-url.js";

export type {
  TransportDebugInfo,
  TransportDebugOptions,
} from "./model-transport-debug.js";
export {
  TransportDebugger,
  getTransportDebugger,
  enableTransportDebug,
  disableTransportDebug,
} from "./model-transport-debug.js";

// ==================== 运行时别名 ====================

export type {
  ModelAliasEntry,
  ModelAliasRegistryOptions,
} from "./model-runtime-aliases.js";
export {
  ModelAliasRegistry,
  getModelAliasRegistry,
  resolveModelAlias,
  addModelAlias,
} from "./model-runtime-aliases.js";
