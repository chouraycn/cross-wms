// 移植自 openclaw/src/infra/package-dist-inventory.ts

export function isLegacyPluginDependencyInstallStagePath(...args: unknown[]): unknown {
  return false;
}
export function collectPackageDistInventory(...args: unknown[]): unknown {
  return [];
}
export function collectLegacyPluginDependencyStagingDebrisPaths(...args: unknown[]): unknown {
  return [];
}
export function assertNoLegacyPluginDependencyStagingDebris(...args: unknown[]): unknown {
  return undefined;
}
export function writePackageDistInventory(...args: unknown[]): unknown {
  return undefined;
}
export function readPackageDistInventoryIfPresent(...args: unknown[]): unknown {
  return undefined;
}
export const PACKAGE_DIST_INVENTORY_RELATIVE_PATH: unknown = undefined as unknown;
export type LOCAL_BUILD_METADATA_DIST_PATHS = unknown;
export const LOCAL_BUILD_METADATA_DIST_PATHS: unknown = undefined as unknown;
