/**
 * Loads plugin doctor contracts from manifest-owned metadata.
 * 移植自 openclaw/src/plugins/doctor-contract-registry.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginDoctorStateMigrationDetection = unknown;

export type PluginDoctorStateMigrationContext = unknown;

export type PluginDoctorStateMigration = unknown;

export type PluginDoctorStateMigrationEntry = unknown;

export function collectRelevantDoctorPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: collectRelevantDoctorPluginIds");
}

export function collectRelevantDoctorPluginIdsForTouchedPaths(...args: unknown[]): unknown {
  throw new Error("not implemented: collectRelevantDoctorPluginIdsForTouchedPaths");
}

export function clearPluginDoctorContractRegistryCache(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginDoctorContractRegistryCache");
}

export function setPluginDoctorContractRegistryModuleLoaderFactoryForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: setPluginDoctorContractRegistryModuleLoaderFactoryForTest");
}

export function listPluginDoctorLegacyConfigRules(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginDoctorLegacyConfigRules");
}

export function listPluginDoctorSessionRouteStateOwners(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginDoctorSessionRouteStateOwners");
}

export function listPluginDoctorStateMigrationEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginDoctorStateMigrationEntries");
}

export function applyPluginDoctorCompatibilityMigrations(...args: unknown[]): unknown {
  throw new Error("not implemented: applyPluginDoctorCompatibilityMigrations");
}

