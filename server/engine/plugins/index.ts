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

// ===================== 深化模块（v3.3 — openclaw 中依赖移植） =====================
// 以下模块从 openclaw/src/plugins/ 移植，包含简单工具函数与少量 @openclaw/* 外部包依赖。
// 依赖 @openclaw/* 外部包的模块已降级为本地实现，详见各文件顶部注释。

// 插件最小宿主版本兼容性检查
export {
  MIN_HOST_VERSION_FORMAT,
  parseMinHostVersionRequirement,
  checkMinHostVersion,
} from './min-host-version.js';
export type {
  MinHostVersionRequirement,
  MinHostVersionCheckResult,
} from './min-host-version.js';

// 包兼容性元数据检查
export {
  resolvePackagePluginApiRange,
} from './package-compat.js';
export type { PackagePluginApiRangeResult } from './package-compat.js';

// 插件安装来源元数据描述与 pinning 警告
export {
  describePluginInstallSource,
} from './install-source-info.js';
export type {
  PluginInstallSourceWarning,
  PluginInstallNpmPinState,
  PluginInstallNpmSourceInfo,
  PluginInstallLocalSourceInfo,
  PluginInstallClawHubSourceInfo,
  PluginInstallSourceInfo,
  DescribePluginInstallSourceOptions,
} from './install-source-info.js';

// ===================== 深化模块（v3.4 — openclaw 高依赖移植） =====================
// 以下模块从 openclaw/src/plugins/ 移植，包含 manifest、host-hook、web-、embedding、
// install、provider、runtime、plugin-* 聚类以及其他高依赖文件。
// 依赖 @openclaw/* 外部包的模块已降级为本地实现，详见各文件顶部注释。
// 使用 `export *` 语法：TypeScript 会自动处理同名冲突（ambiguous exports 会被静默排除），
// 仅在下游实际引用冲突名称时才会报错。

// manifest 聚类
export * from './manifest.js';
// export * from './manifest-command-aliases.js';  // removed: TS2308 conflict
export * from './manifest-command-aliases.runtime.js';
export * from './manifest-contract-eligibility.js';
export * from './manifest-contract-runtime.js';
// export * from './manifest-contribution-ids.js';  // removed: TS2308 conflict
export * from './manifest-metadata-scan.js';
export * from './manifest-model-id-normalization.js';
export * from './manifest-model-suppression.js';
export * from './manifest-owner-policy.js';
// export * from './manifest-registry.js';  // removed: TS2308 conflict
export * from './manifest-registry-installed.js';
export * from './manifest-tool-availability.js';

// host-hook 聚类
export * from './host-hooks.js';
export * from './host-hook-runtime.js';
export * from './host-hook-state.js';
// export * from './host-hook-attachments.js';  // 依赖过多未移植模块：infra/outbound/message, channels/plugins 等
export * from './host-hook-scheduled-turns.js';
export * from './host-hook-cleanup.js';
export * from './host-hook-cleanup-timeout.js';
export * from './host-hook-json.js';
export * from './host-tool-param-parsers.js';
export * from './hook-agent-context.js';
// export * from './hook-before-agent-start.types.js';  // TS2308: 冲突符号: PluginHookBeforeAgentStartEvent, PluginHookBeforeAgentStartResult, PluginHookBeforeModelResolveEvent, PluginHookBeforeModelResolveResult, PluginHookBeforePromptBuildEvent, PluginHookBeforePromptBuildResult
export * from './hook-channel-context.types.js';
export * from './hook-decision-types.js';
export * from './hook-runner-global-state.js';
export * from './hook-runner-global.js';
export * from './hooks.js';

// web- 聚类
export * from './web-content-extractor-public-artifacts.js';
export * from './web-content-extractor-types.js';
export * from './web-content-extractors.runtime.js';
export * from './web-fetch-providers.runtime.js';
export * from './web-fetch-providers.shared.js';
export * from './web-provider-public-artifacts.explicit.js';
export * from './web-provider-public-artifacts.js';
export * from './web-provider-resolution-shared.js';
export * from './web-provider-runtime-shared.js';
export * from './web-provider-types.js';
export * from './web-search-credential-presence.js';
export * from './web-search-install-catalog.js';
export * from './web-search-providers.runtime.js';
export * from './web-search-providers.shared.js';

// embedding 聚类
export * from './embedding-provider-config.js';
export * from './embedding-provider-runtime-shared.js';
export * from './embedding-provider-runtime.js';
export * from './embedding-providers.js';
export * from './memory-embedding-provider-runtime.js';
export * from './memory-embedding-providers.js';
export * from './openai-compatible-embedding-provider.js';

// install 聚类
export * from './install.js';
export * from './install.runtime.js';
export * from './install-paths.js';
export * from './install-overrides.js';
export * from './install-policy-context.js';
export * from './install-channel-specs.js';
export * from './install-security-scan.js';
// export * from './install-security-scan.runtime.js';  // removed: TS2308 conflict
export * from './path-safety.js';

// provider 聚类
export * from './provider-api-key-auth.js';
export * from './provider-api-key-auth.runtime.js';
// export * from './provider-auth-choice.js';  // removed: TS2308 conflict
// export * from './provider-auth-choice.runtime.js';  // removed: TS2308 conflict
export * from './provider-auth-choice-helpers.js';
export * from './provider-auth-choice-preference.js';
export * from './provider-auth-choices.js';
export * from './provider-auth-helpers.js';
export * from './provider-auth-input.js';
export * from './provider-auth-mode.js';
export * from './provider-auth-ref.js';
export * from './provider-auth-token.js';
export * from './provider-auth-types.js';
export * from './provider-catalog.js';
export * from './provider-catalog-result.js';
export * from './provider-catalog-unified-text.js';
export * from './provider-claude-thinking.js';
export * from './provider-config-context.types.js';
export * from './provider-config-owner.js';
export * from './provider-contract-public-artifacts.js';
export * from './provider-discovery.js';
export * from './provider-discovery.runtime.js';
export * from './provider-hook-runtime.js';
export * from './provider-install-catalog.js';
export * from './provider-model-compat.js';
export * from './provider-model-helpers.js';
export * from './provider-model-primary.js';
export * from './provider-oauth-flow.js';
export * from './provider-openai-chatgpt-oauth-tls.js';
export * from './provider-openai-chatgpt-oauth.js';
export * from './provider-public-artifacts.js';
export * from './provider-registry-shared.js';
export * from './provider-replay-helpers.js';
// provider-runtime.js 已从 barrel 移除：其导出的 `testing` 与多个模块冲突（TS2308）。
// 下游可直接从 './provider-runtime.js' 显式导入。
export * from './provider-runtime.runtime.js';
export * from './provider-self-hosted-setup.js';
export * from './provider-thinking.js';
export * from './provider-thinking.types.js';
export * from './provider-validation.js';
export * from './provider-wizard.js';
// export * from './providers.js';  // removed: TS2308 conflict
export * from './providers.runtime.js';
export * from './compaction-provider.js';

// runtime 聚类
export * from './runtime.js';
// export * from './runtime-channel-state.js';  // removed: TS2308 conflict
export * from './runtime-plugins.runtime.js';
export * from './runtime-sidecar-paths.js';
export * from './runtime-sidecar-paths-baseline.js';
// export * from './runtime-state.js';  // removed: TS2308 conflict
export * from './runtime-workspace-state.js';

// plugin-* 聚类
export * from './plugin-cache-primitives.js';
// export * from './plugin-control-plane-context.js';  // TS2308: 冲突符号: PluginSourceRoots
// export * from './plugin-lookup-table.js';  // removed: TS2308 conflict
export * from './plugin-metadata-lifecycle.js';
export * from './plugin-metadata-snapshot.js';
// export * from './plugin-module-loader-cache.js';  // removed: TS2308 conflict
export * from './plugin-peer-link.js';
export * from './plugin-registry.js';
export * from './plugin-registry-contributions.js';
export * from './plugin-registry-id-normalizer.js';
export * from './plugin-registry-snapshot.js';
export * from './plugin-scan-existence-cache.js';
export * from './plugin-sdk-dist-alias.js';
// export * from './plugin-sdk-native-resolver.js';  // removed: TS2308 conflict
export * from './plugin-snapshot-fingerprint.js';
export * from './plugin-version-drift.js';
export * from './plugin-load-profile.js';

// installed-plugin-index 聚类
export * from './installed-plugin-index.js';
export * from './installed-plugin-index-config-path-scope.js';
export * from './installed-plugin-index-hash.js';
export * from './installed-plugin-index-install-records.js';
export * from './installed-plugin-index-invalidation.js';
export * from './installed-plugin-index-manifest.js';
export * from './installed-plugin-index-policy.js';
export * from './installed-plugin-index-record-builder.js';
export * from './installed-plugin-index-record-cache.js';
export * from './installed-plugin-index-record-reader.js';
export * from './installed-plugin-index-records.js';
export * from './installed-plugin-index-registry.js';
export * from './installed-plugin-index-scope-lookup.js';
export * from './installed-plugin-index-store-path.js';
export * from './installed-plugin-index-store.js';
export * from './installed-plugin-index-types.js';

// 其他高依赖文件（降级 stub）
export * from './activation-context.js';
export * from './activation-planner.js';
export * from './activation-source-config.js';
export * from './active-runtime-registry.js';
export * from './agent-event-emission.js';
export * from './agent-tool-result-middleware-loader.js';
export * from './agent-tool-result-middleware.js';
export * from './api-builder.js';
export * from './api-facades.js';
export * from './api-lifecycle.js';
export * from './build-smoke-entry.js';
export * from './bundle-commands.js';
export * from './bundle-config-shared.js';
export * from './bundle-lsp.js';
export * from './bundle-manifest.js';
export * from './bundle-mcp.js';
export * from './bundled-capability-runtime.js';
export * from './bundled-channel-config-metadata.js';
export * from './bundled-channel-runtime.js';
export * from './bundled-compat.js';
export * from './bundled-dir.js';
export * from './bundled-load-path-aliases.js';
export * from './bundled-manifest-contract-plugins.js';
// export * from './bundled-package-channel-metadata.js';  // removed: TS2308 conflict
export * from './bundled-plugin-metadata.js';
export * from './bundled-plugin-scan.js';
export * from './bundled-source-overlays.js';
export * from './bundled-sources.js';
export * from './capability-provider-runtime.js';
export * from './captured-registration.js';
export * from './channel-catalog-registry.js';
// export * from './channel-plugin-ids.js';  // removed: TS2308 conflict
export * from './channel-presence-policy.js';
export * from './channel-validation.js';
export * from './clawhub-install-records.js';
export * from './clawhub.js';
export * from './cli-backend.types.js';
export * from './cli-backends.runtime.js';
export * from './cli-gateway-nodes-runtime.js';
// export * from './cli-registry-loader.js';  // removed: TS2308 conflict
export * from './cli.js';
export * from './codex-app-server-extension-factory.js';
export * from './command-registration.js';
export * from './command-registry-state.js';
export * from './command-specs.js';
// export * from './commands.js';  // TS2308: 冲突符号: testing, __testing
export * from './config-activation-shared.js';
export * from './config-contract-matches.js';
export * from './config-contracts.js';
// export * from './config-normalization-shared.js';  // removed: TS2308 conflict
// export * from './config-policy.js';  // removed: TS2308 conflict
export * from './config-schema.js';
export * from './config-state.js';
// export * from './conversation-binding.js';  // TS2308: 冲突符号: testing, __testing
export * from './conversation-binding.types.js';
export * from './current-plugin-metadata-snapshot.js';
export * from './current-plugin-metadata-state.js';
export * from './dev-source-root.js';
export * from './discovery.js';
export * from './doctor-contract-registry.js';
export * from './document-extractor-public-artifacts.js';
export * from './document-extractor-types.js';
export * from './document-extractors.runtime.js';
export * from './effective-plugin-ids.js';
export * from './enable.js';
export * from './externalized-bundled-plugins.js';
export * from './gateway-startup-plugin-ids.js';
export * from './gateway-startup-speech-providers.js';
export * from './generated-plugin-test-helpers.js';
export * from './git-install.js';
export * from './hardlink-policy.js';
export * from './http-registry.js';
export * from './http-route-overlap.js';
export * from './inspect-shape.js';
export * from './interactive-binding-helpers.js';
export * from './interactive-registry.js';
export * from './interactive-shared.js';
export * from './interactive-state.js';
export * from './interactive.js';
export * from './lazy-service-module.js';
export * from './legacy-npm-declaration.js';
export * from './loader-cache-state.js';
export * from './loader-channel-setup.js';
export * from './loader-provenance.js';
export * from './loader-records.js';
export * from './logger.js';
export * from './managed-npm-retention.js';
export * from './memory-runtime.js';
export * from './memory-state.js';
export * from './migration-provider-runtime.js';
export * from './model-catalog-registration.js';
export * from './native-module-require.js';
export * from './npm-project-roots.js';
export * from './official-external-install-records.js';
export * from './official-external-plugin-catalog.js';
export * from './official-external-plugin-repair-hints.js';
export * from './package-entry-resolution.js';
export * from './package-entrypoints.js';
export * from './public-surface-loader.js';
export * from './public-surface-runtime.js';
export * from './register-plugin-cli-command-groups.js';
export * from './registry-empty.js';
export * from './registry-lifecycle.js';
export * from './registry-types.js';
export * from './schema-validator.js';
// export * from './sdk-alias.js';  // removed: TS2308 conflict
export * from './security-events.js';
export * from './services.js';
export * from './session-entry-slot-keys.js';
export * from './setup-descriptors.js';
export * from './setup-registry.runtime.js';
export * from './setup-registry.js';
export * from './slots.js';
export * from './source-display.js';
export * from './stale-local-bundled-plugin-install-records.js';
export * from './status-dependencies-core.js';
export * from './status-snapshot.js';
export * from './synthetic-auth.runtime.js';
export * from './text-transforms.runtime.js';
export * from './toggle-config.js';
export * from './tool-contracts.js';
export * from './tool-descriptor-cache.js';
export * from './tools.js';
export * from './trusted-tool-policy.js';
export * from './uninstall.js';
export * from './validation-diagnostics.js';

// ===================== 移植 stub（v4.0 — openclaw 降级 stub 批量移植） =====================
export * from './archive-fixtures.js';
export * from './bundled-capability-metadata.js';
export * from './bundled-plugin-roots.js';
export * from './channel-runtime-contexts.js';
export * from './cold-plugin-fixtures.js';
export * from './config-runtime.js';
export * from './fs-fixtures.js';
export * from './gateway-bindings.js';
export * from './gateway-request-scope.js';
export * from './host-hook-fixture.js';
export * from './install-fixtures.js';
export * from './load-context.js';
export * from './managed-npm-plugin.js';
export * from './media-runtime.js';
export * from './metadata-registry-loader.js';
export * from './model-auth-types.js';
export * from './native-deps.js';
export * from './registry-jiti-mocks.js';
export * from './rootdir-boundary-canary.js';
export * from './runtime-agent.js';
export * from './runtime-cache.js';
export * from './runtime-channel.js';
export * from './runtime-config.js';
export * from './runtime-embedded-agent.runtime.js';
export * from './runtime-events.js';
export * from './runtime-llm.runtime.js';
export * from './runtime-logging.js';
export * from './runtime-media.js';
export * from './runtime-model-auth.runtime.js';
export * from './runtime-plugin-boundary.js';
export * from './runtime-registry-loader.js';
export * from './runtime-system.js';
export * from './runtime-task-test-harness.js';
export * from './runtime-taskflow.js';
export * from './runtime-taskflow.types.js';
// export * from './runtime-tasks.js';  // removed: TS2308 conflict
// export * from './runtime-tasks.types.js';  // removed: TS2308 conflict
export * from './runtime-web-channel-plugin.js';
export * from './shared.js';
export * from './speech-core.js';
export * from './standalone-runtime-registry-loader.js';
export * from './task-domain-types.js';
export * from './tts-contract-suites.js';
export * from './types-channel.js';
export * from './types-core.js';

// ===================== 深化模块（v5.0 — Plugin SDK 扩展） =====================
// 以下模块为 SDK 层新增文件，提供统一的插件运行时、能力提供者、
// 通道运行时、安装管道与 API/Route 层。
// 注意：plugin-registry.ts 已在上方导出（line 622），此处不再重复。
// 注意：provider-runtime.ts 因 testing 符号冲突已从 barrel 移除（line 593-594），此处不再重复。

// ---- Core Runtime ----
export * from './plugin-errors.js';
export * from './plugin-types.js';
export * from './plugin-constants.js';
export * from './plugin-events.js';
export * from './plugin-context.js';
export * from './plugin-permissions.js';
export * from './plugin-sandbox.js';
export * from './plugin-manifest.js';
export * from './plugin-loader.js';
export * from './plugin-lifecycle.js';
export * from './plugin-runtime.js';

// ---- Capability Providers ----
export * from './capability-provider.js';
export * from './llm-capability.js';
export * from './tool-capability.js';
export * from './channel-capability.js';
export * from './memory-capability.js';
export * from './search-capability.js';
export * from './media-capability.js';
export * from './embedding-capability.js';
export * from './skill-capability.js';

// ---- Bundled Channel Runtime ----
export * from './channel-adapter-runtime.js';
export * from './channel-message-router.js';
export * from './channel-health-checker.js';

// ---- Plugin Installation Pipeline ----
export * from './install-pipeline.js';
export * from './plugin-validator.js';
export * from './plugin-scanner.js';
export * from './plugin-dependency-resolver.js';
export * from './plugin-version-manager.js';

// ---- API/Route Layer ----
export * from './plugin-api.js';
export * from './plugin-utils.js';
export * from './plugin-helpers.js';
