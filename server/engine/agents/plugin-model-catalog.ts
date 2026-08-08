/**
 * 移植自 openclaw/src/agents/plugin-model-catalog.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type PluginModelCatalogMetadataSnapshot = unknown;
export const PLUGIN_MODEL_CATALOG_FILE: any = undefined;
export const PLUGIN_MODEL_CATALOG_GENERATED_BY: any = undefined;
export function encodePluginModelCatalogRelativePath(..._args: any[]): any {
  return undefined;
}
export function isPluginModelCatalogRelativePath(..._args: any[]): any {
  return false;
}
export function decodePluginModelCatalogRelativePathPluginId(..._args: any[]): any {
  return undefined;
}
export function listPluginModelCatalogRelativePaths(..._args: any[]): any {
  return [];
}
export function listPluginModelCatalogFiles(..._args: any[]): any {
  return [];
}
export function isGeneratedPluginModelCatalog(..._args: any[]): any {
  return false;
}
export function resolvePluginModelCatalogOwnerPluginId(..._args: any[]): any {
  return undefined;
}
export function filterGeneratedPluginModelCatalogProviders(..._args: any[]): any {
  return undefined;
}
