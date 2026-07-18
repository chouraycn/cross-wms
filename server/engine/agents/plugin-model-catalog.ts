/**
 * 移植自 openclaw/src/agents/plugin-model-catalog.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type PluginModelCatalogMetadataSnapshot = unknown;
export const PLUGIN_MODEL_CATALOG_FILE: unknown = undefined;
export const PLUGIN_MODEL_CATALOG_GENERATED_BY: unknown = undefined;
export function encodePluginModelCatalogRelativePath(..._args: unknown[]): unknown {
  throw new Error("encodePluginModelCatalogRelativePath not implemented (openclaw stub)");
}
export function isPluginModelCatalogRelativePath(..._args: unknown[]): unknown {
  throw new Error("isPluginModelCatalogRelativePath not implemented (openclaw stub)");
}
export function decodePluginModelCatalogRelativePathPluginId(..._args: unknown[]): unknown {
  throw new Error("decodePluginModelCatalogRelativePathPluginId not implemented (openclaw stub)");
}
export function listPluginModelCatalogRelativePaths(..._args: unknown[]): unknown {
  throw new Error("listPluginModelCatalogRelativePaths not implemented (openclaw stub)");
}
export function listPluginModelCatalogFiles(..._args: unknown[]): unknown {
  throw new Error("listPluginModelCatalogFiles not implemented (openclaw stub)");
}
export function isGeneratedPluginModelCatalog(..._args: unknown[]): unknown {
  throw new Error("isGeneratedPluginModelCatalog not implemented (openclaw stub)");
}
export function resolvePluginModelCatalogOwnerPluginId(..._args: unknown[]): unknown {
  throw new Error("resolvePluginModelCatalogOwnerPluginId not implemented (openclaw stub)");
}
export function filterGeneratedPluginModelCatalogProviders(..._args: unknown[]): unknown {
  throw new Error("filterGeneratedPluginModelCatalogProviders not implemented (openclaw stub)");
}
