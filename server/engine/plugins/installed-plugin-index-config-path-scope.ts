// Resolves config path scope entries for installed plugin index records.
//
// 移植自 openclaw/src/plugins/installed-plugin-index-config-path-scope.ts。
//
// 降级策略：仅依赖本地 ./installed-plugin-index-types.js，无需进一步降级。
// 行为与 openclaw 原版一致：检测仍缺少 config-path activation 元数据的 index 记录。

import type {
  InstalledPluginIndex,
  InstalledPluginIndexRecord,
} from "./installed-plugin-index-types.js";

/** Compat code marking install records that need config-path activation metadata. */
export const CONFIG_PATH_ACTIVATION_COMPAT_CODE = "activation-config-path-hint";

function recordUsesConfigPathActivation(plugin: InstalledPluginIndexRecord): boolean {
  return plugin.compat.includes(CONFIG_PATH_ACTIVATION_COMPAT_CODE);
}

/** True when an index still has config-path activation records missing startup metadata. */
export function hasMissingConfigPathActivationMetadata(index: InstalledPluginIndex): boolean {
  return index.plugins.some(
    (plugin) => recordUsesConfigPathActivation(plugin) && plugin.startup.configPaths === undefined,
  );
}

/** True when a record migrated config-path activation startup metadata. */
export function hasConfigPathActivationMetadataMigration(params: {
  previous: InstalledPluginIndexRecord;
  current: InstalledPluginIndexRecord;
}): boolean {
  return (
    recordUsesConfigPathActivation(params.previous) &&
    params.previous.startup.configPaths === undefined &&
    params.current.startup.configPaths !== undefined
  );
}
