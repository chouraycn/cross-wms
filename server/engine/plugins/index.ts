// 顶层 Plugin 系统 barrel — 兼容旧导出 + 新增深化模块
//
// 旧导出（指向 server/engine/plugin*.ts）保持不变以避免破坏运行时；
// 新增的深化模块在 server/engine/plugins/ 内部，从这里统一再导出。

// ===================== 旧导出（保持不变） =====================
export { pluginRegistry } from '../pluginRegistry.js';

export {
  discoverPlugins,
  loadPlugin,
  loadAllPlugins,
  getLoadedPlugin,
  listLoadedPlugins,
  unloadPlugin,
  reloadPlugin,
  clearLoadedPlugins,
  installFromZip,
  installFromGit,
  installFromNpm,
} from '../pluginLoader.js';

export {
  validateManifest,
  parseManifest,
  normalizeManifest,
  generatePluginId,
  isManifestValid,
} from '../pluginManifest.js';

export {
  getPluginActivationState,
  setPluginActivationState,
  enablePlugin,
  disablePlugin,
  batchSetActivationState,
  listActivationRecords,
} from '../pluginActivation.js';

export { pluginManager } from '../pluginManager.js';

export { pluginHooks } from '../pluginHooks.js';

export { executeInSandbox } from '../pluginSandbox.js';

export { getInstalledPlugins, recordPluginInstall, removePluginInstallRecord } from './installs.js';
export type { PluginInstallRecord } from './installs.js';

export { resolvePluginRoots, getPluginRoot, addPluginRoot } from './roots.js';
export type { PluginRoot } from './roots.js';

export {
  getPluginStatus,
  getPluginStatuses,
  setPluginStatus,
  getPluginsByStatus,
  clearPluginStatus,
} from './status.js';
export type { PluginStatus, PluginStatusInfo } from './status.js';

export {
  checkPluginUpdates,
  applyPluginUpdates,
  checkAllPluginUpdates,
  applyAllPluginUpdates,
  invalidateUpdateCache,
} from './update.js';
export type { PluginUpdateInfo } from './update.js';

export {
  setPluginLoadState,
  getPluginLoadRecord,
  listLoadedPluginRecords,
  listFailedPlugins,
  setPluginDependencies,
  setPluginSource,
  clearPluginLoadRecord,
} from './loader-state.js';
export type { PluginLoadRecord, PluginLoadState } from './loader-state.js';

export {
  registerPluginHook,
  unregisterPluginHook,
  unregisterPluginHooksByPlugin,
  getHooksForName,
  getHooksByPlugin,
  enablePluginHook,
  disablePluginHook,
  listAllPluginHooks,
} from './hook-registry.js';
export type { PluginHookRegistration } from './hook-registry.js';

// ===================== 深化模块（v3.1） =====================

// types.ts
export type {
  PluginCapabilityKind,
  PluginSource,
  PluginVersionRange,
  PluginDependency,
  PluginManifest as PluginRuntimeManifest,
  PluginToolDefinition as PluginRuntimeToolDefinition,
  PluginTrigger,
  PluginConfigSchema,
  PluginConfigProperty,
  PluginInstance,
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginFetch,
  PluginFetchInit,
  PluginFetchResponse,
  PluginEventBus,
  PluginConfigAccessor,
  PluginLifecycle,
  PluginRuntimeRecord,
  PluginEvent,
  PluginHealthMetrics,
  MarketplaceEntry,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  MarketplaceRating,
  PluginContractResult,
} from './types.js';

// permissions.ts（深化后）
export {
  setPluginPermissionPolicy,
  getPluginPermissionPolicy,
  grantPluginPermission,
  denyPluginPermission,
  checkPluginPermission,
  clearPluginPermissions,
  listAllPermissionPolicies,
  getGrantedPermissions,
  getDeniedPermissions,
  listPermissionsByGroup,
  getPermissionDescriptor,
  setPermissionResolver,
  createPermissionRequest,
  requestPermission,
  getPermissionRequest,
  listPermissionRequests,
  expireStaleRequests,
  resetPermissionStateForTests,
  PERMISSION_DESCRIPTORS,
} from './permissions.js';
export type {
  PluginPermission,
  PluginPermissionGroup,
  PluginPermissionPolicy,
  PermissionRequest,
  PermissionRequestState,
  PluginPermissionDescriptor,
  PermissionResolver,
} from './permissions.js';

// loader.ts
export {
  parseVersion,
  compareVersions,
  satisfiesVersion,
  validateManifest as validateRuntimeManifest,
  resolveDependencyTree,
  computeLoadOrder,
  findIncompatiblePlugins,
  findMissingDependencies,
  logLoadOrder,
} from './loader.js';
export type { PluginLoadOrderNode, DependencyResolutionResult } from './loader.js';

// lifecycle.ts
export {
  assertTransition,
  invokeLifecycleHook,
  enablePlugin as enablePluginLifecycle,
  disablePlugin as disablePluginLifecycle,
  installPlugin,
  uninstallPlugin,
  updatePlugin as updatePluginLifecycle,
  getLifecycleState,
  getLifecycleEvents,
  listLifecycleStates,
  resetLifecycleStateForTests,
} from './lifecycle.js';
export type { LifecycleState } from './lifecycle.js';

// sandbox.ts
export {
  runInSandbox,
  createSandboxedFetch,
  createSandboxedRequire,
  detectDangerousCode,
  getSandboxStats,
  listAllSandboxStats,
  resetSandboxStats,
  resetCircuitBreaker,
} from './sandbox.js';
export type {
  SandboxResourceLimits,
  SandboxCallResult,
  SandboxStats,
  CircuitBreakerConfig,
} from './sandbox.js';
export { DEFAULT_SANDBOX_LIMITS } from './sandbox.js';

// registry.ts
export { pluginRuntimeRegistry, createPluginRegistry } from './registry.js';
export type { RegistryEntry } from './registry.js';

// marketplace.ts
export {
  createMarketplaceClient,
  seedMarketplaceCache,
  clearMarketplaceCache,
  getMarketplaceCacheSize,
} from './marketplace.js';
export type { MarketplaceClient, MarketplaceFetch } from './marketplace.js';

// config-manager.ts
export {
  pluginConfigManager,
  createConfigManager,
  validateConfig,
} from './config-manager.js';
export type { ConfigManager, ConfigValidationResult } from './config-manager.js';

// health-checker.ts
export {
  runHealthCheck,
  startHealthCheckLoop,
  stopHealthCheckLoop,
  getLastHealthSnapshot,
  getPluginHealth,
  recordPluginError,
  getPluginErrors,
  getTotalErrorCount,
  resetHealthCheckerForTests,
} from './health-checker.js';
export type { HealthCheckOptions, HealthSnapshot } from './health-checker.js';

// api.ts
export {
  createPluginApi,
  getPluginTools,
  listAllPluginTools,
  resetPluginApiForTests,
} from './api.js';
export type { PluginApi, CreatePluginApiOptions } from './api.js';

// contract.ts
export {
  HOST_API_VERSION,
  HOST_API_SUPPORTED_RANGE,
  REQUIRED_MANIFEST_FIELDS,
  REQUIRED_TOOL_FIELDS,
  checkPluginContract,
  comparePluginVersions,
  isManifestContractValid,
  formatContractReport,
} from './contract.js';

// ===================== 深化模块（v3.2 — openclaw 低依赖移植） =====================
// 以下模块从 openclaw/src/plugins/ 移植，仅包含纯类型、常量、简单工具函数。
// 依赖 @openclaw/* 外部包的模块已降级为本地实现，详见各文件顶部注释。

// 纯类型模块
export type { PluginKind } from './plugin-kind.types.js';
export type { PluginOrigin } from './plugin-origin.types.js';
export type {
  PluginConfigUiHint,
  PluginFormat,
  PluginBundleFormat,
  PluginDiagnosticCode,
  PluginDiagnostic,
} from './manifest-types.js';
export type { DoctorSessionRouteStateOwner } from './doctor-session-route-state-owner-types.js';
export type { PluginRegistrySnapshotSource } from './plugin-registry-snapshot.types.js';

// 常量 + 类型模块
export {
  PluginApprovalResolutions,
  type PluginApprovalResolution,
  type PluginHookBeforeToolCallResult,
} from './hook-before-tool-call-result.js';
export {
  CLAWHUB_INSTALL_ERROR_CODE,
  type ClawHubInstallErrorCode,
} from './clawhub-error-codes.js';

// 类型集合模块
export type {
  ActiveChannelPluginRuntimeShape,
  ActivePluginChannelRegistration,
  ActivePluginChannelRegistry,
} from './channel-registry-state.types.js';

// 工具函数模块
export { unwrapDefaultModuleExport } from './module-export.js';
export {
  normalizeAgentPromptSurfaceKind,
  isOpenClawMainPromptSurface,
  type AgentPromptSurfaceKind,
} from './agent-prompt-surface-kind.js';
export { encodeStartupTraceSegment } from './startup-trace-segment.js';
export { normalizePluginHttpPath } from './http-path.js';

// hook 系统类型与函数
// 注意：PluginHookRegistration 已从 ./hook-registry.js 导出（接口定义），
// 此处不再从 ./hook-types.js 重复导出泛型版本以避免 TS2300 冲突。
export {
  PLUGIN_HOOK_NAMES,
  DEPRECATED_PLUGIN_HOOKS,
  PROMPT_INJECTION_HOOK_NAMES,
  CONVERSATION_HOOK_NAMES,
  isDeprecatedPluginHookName,
  isPluginHookName,
  isPromptInjectionHookName,
  isConversationHookName,
} from './hook-types.js';
export type {
  PluginHookMessageContext,
  PluginHookInboundClaimContext,
  PluginHookInboundClaimEvent,
  PluginHookMessageReceivedEvent,
  PluginHookMessageSendingEvent,
  PluginHookMessageSendingResult,
  PluginHookMessageSentEvent,
} from './hook-message.types.js';
export type {
  PluginLegacyHookRegistration,
  HookRunnerRegistry,
  GlobalHookRunnerRegistry,
} from './hook-registry.types.js';

// host-hook 轮次注入类型
export type {
  PluginNextTurnInjectionPlacement,
  PluginNextTurnInjection,
  PluginNextTurnInjectionRecord,
  PluginNextTurnInjectionEnqueueResult,
  PluginAgentTurnPrepareEvent,
  PluginAgentTurnPrepareResult,
  PluginHeartbeatPromptContributionEvent,
  PluginHeartbeatPromptContributionResult,
} from './host-hook-turn-types.js';

// codex 扩展与中间件类型
export type {
  CodexAppServerToolResultEvent,
  CodexAppServerExtensionContext,
  CodexAppServerToolResultHandlerResult,
  CodexAppServerExtensionRuntime,
  CodexAppServerExtensionFactory,
} from './codex-app-server-extension-types.js';
export type {
  AgentToolResultMiddlewareRuntime,
  AgentToolResultMiddlewareHarness,
  AgentToolResultMiddlewareEvent,
  AgentToolResultMiddlewareContext,
  AgentToolResultMiddlewareResult,
  AgentToolResultMiddleware,
  AgentToolResultMiddlewareOptions,
} from './agent-tool-result-middleware-types.js';

// 嵌入与 provider 类型
export type {
  EmbeddingInput,
  EmbeddingProviderCallOptions,
  EmbeddingProviderRuntime,
  EmbeddingProviderIndexIdentity,
  EmbeddingProvider,
  EmbeddingProviderCreateOptions,
  EmbeddingProviderCreateResult,
  EmbeddingProviderAdapter,
  RegisteredEmbeddingProvider,
} from './embedding-provider-types.js';
export type { InstallSafetyOverrides } from './install-security-scan.types.js';
export type {
  OpenClawPluginActiveModelContext,
  OpenClawPluginToolContext,
  OpenClawPluginToolFactory,
  OpenClawPluginToolOptions,
  OpenClawPluginHookOptions,
} from './tool-types.js';
export type {
  ModelProviderAuthMode,
  ProviderResolveSyntheticAuthContext,
  ProviderSyntheticAuthResult,
  ProviderResolveExternalAuthProfilesContext,
  ProviderResolveExternalOAuthProfilesContext,
  ProviderExternalAuthProfile,
  ProviderExternalOAuthProfile,
} from './provider-external-auth.types.js';
export type { ProviderRuntimeModel } from './provider-runtime-model.types.js';

// 元数据快照类型
export type {
  PluginMetadataSnapshotPluginIdScope,
  PluginMetadataSnapshotOwnerMaps,
  PluginMetadataSnapshotMetrics,
  PluginMetadataSnapshotRegistryDiagnostic,
  PluginMetadataSnapshot,
  PluginMetadataRegistryView,
  PluginMetadataManifestView,
  LoadPluginMetadataSnapshotParams,
  ResolvePluginMetadataSnapshotParams,
} from './plugin-metadata-snapshot.types.js';

// 插件作用域与默认启用
export {
  normalizePluginIdScope,
  hasExplicitPluginIdScope,
  hasNonEmptyPluginIdScope,
  createPluginIdScopeSet,
  serializePluginIdScope,
} from './plugin-scope.js';
export {
  isPluginEnabledByDefaultForPlatform,
  type PluginDefaultEnablement,
} from './default-enablement.js';

// 插件生命周期追踪
export {
  tracePluginLifecyclePhase,
  tracePluginLifecyclePhaseAsync,
} from './plugin-lifecycle-trace.js';

// 依赖拒绝列表
export {
  blockedInstallDependencyPackageNames,
  findBlockedManifestDependencies,
  findBlockedNodeModulesDirectory,
  findBlockedNodeModulesFileAlias,
  findBlockedPackageDirectoryInPath,
  findBlockedPackageFileAliasInPath,
  type BlockedManifestDependencyFinding,
  type BlockedPackageDirectoryFinding,
  type BlockedPackageFileFinding,
} from './dependency-denylist.js';

// 插件配置信任策略
export {
  normalizePluginConfigId,
  isWorkspacePluginAllowedByConfig,
} from './plugin-config-trust.js';
