// 移植自 openclaw/src/plugins/bundled-capability-metadata.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type BundledPluginContractSnapshot = unknown;
export type BundledCapabilityManifest = unknown;
export function buildBundledPluginContractSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: buildBundledPluginContractSnapshot");
}
export function hasBundledPluginContractSnapshotCapabilities(...args: unknown[]): unknown {
  throw new Error("not implemented: hasBundledPluginContractSnapshotCapabilities");
}
export function resolveBundledContractSnapshotPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledContractSnapshotPluginIds");
}
export const BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS: unknown = undefined;
export const BUNDLED_LEGACY_PLUGIN_ID_ALIASES: unknown = undefined;
export const BUNDLED_AUTO_ENABLE_PROVIDER_PLUGIN_IDS: unknown = undefined;
