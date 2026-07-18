// 移植自 openclaw/src/infra/package-dist-inventory.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isLegacyPluginDependencyInstallStagePath(...args: unknown[]): unknown {
  throw new Error("not implemented: isLegacyPluginDependencyInstallStagePath");
}
export function collectPackageDistInventory(...args: unknown[]): unknown {
  throw new Error("not implemented: collectPackageDistInventory");
}
export function collectLegacyPluginDependencyStagingDebrisPaths(...args: unknown[]): unknown {
  throw new Error("not implemented: collectLegacyPluginDependencyStagingDebrisPaths");
}
export function assertNoLegacyPluginDependencyStagingDebris(...args: unknown[]): unknown {
  throw new Error("not implemented: assertNoLegacyPluginDependencyStagingDebris");
}
export function writePackageDistInventory(...args: unknown[]): unknown {
  throw new Error("not implemented: writePackageDistInventory");
}
export function readPackageDistInventoryIfPresent(...args: unknown[]): unknown {
  throw new Error("not implemented: readPackageDistInventoryIfPresent");
}
export const PACKAGE_DIST_INVENTORY_RELATIVE_PATH: unknown = undefined;
export type LOCAL_BUILD_METADATA_DIST_PATHS = unknown;
export const LOCAL_BUILD_METADATA_DIST_PATHS: unknown = undefined;
