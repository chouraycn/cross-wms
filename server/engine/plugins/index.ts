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
