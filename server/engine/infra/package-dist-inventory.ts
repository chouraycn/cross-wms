// 移植自 openclaw/src/infra/package-dist-inventory.ts

export function isLegacyPluginDependencyInstallStagePath(...args: any[]): any {
  return false;
}
export function collectPackageDistInventory(...args: any[]): any {
  return [];
}
export function collectLegacyPluginDependencyStagingDebrisPaths(...args: any[]): any {
  return [];
}
export function assertNoLegacyPluginDependencyStagingDebris(...args: any[]): any {
  return undefined;
}
export function writePackageDistInventory(...args: any[]): any {
  return undefined;
}
export function readPackageDistInventoryIfPresent(...args: any[]): any {
  return undefined;
}
export const PACKAGE_DIST_INVENTORY_RELATIVE_PATH: any = undefined as any;
export type LOCAL_BUILD_METADATA_DIST_PATHS = unknown;
export const LOCAL_BUILD_METADATA_DIST_PATHS: any = undefined as any;
