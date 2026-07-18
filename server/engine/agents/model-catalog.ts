/**
 * 移植自 openclaw/src/agents/model-catalog.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { findModelCatalogEntry, findModelInCatalog, modelSupportsInput } from "./model-catalog-lookup.js";
export type { ModelCatalogEntry, ModelInputType } from "./model-catalog.types.js";
export function resetModelCatalogCache(..._args: unknown[]): unknown {
  throw new Error("resetModelCatalogCache not implemented (openclaw stub)");
}
export function resetModelCatalogCacheForTest(..._args: unknown[]): unknown {
  throw new Error("resetModelCatalogCacheForTest not implemented (openclaw stub)");
}
export function setModelCatalogImportForTest(..._args: unknown[]): unknown {
  throw new Error("setModelCatalogImportForTest not implemented (openclaw stub)");
}
export function loadManifestModelCatalog(..._args: unknown[]): unknown {
  throw new Error("loadManifestModelCatalog not implemented (openclaw stub)");
}
export async function loadModelCatalog(..._args: unknown[]): Promise<unknown> {
  throw new Error("loadModelCatalog not implemented (openclaw stub)");
}
export function modelSupportsVision(..._args: unknown[]): unknown {
  throw new Error("modelSupportsVision not implemented (openclaw stub)");
}
export function modelSupportsDocument(..._args: unknown[]): unknown {
  throw new Error("modelSupportsDocument not implemented (openclaw stub)");
}
