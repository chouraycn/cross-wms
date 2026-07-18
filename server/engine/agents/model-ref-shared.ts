/**
 * 移植自 openclaw/src/agents/model-ref-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { modelKey } from "../shared/model-key.js";
export type ProviderModelIdNormalizationOptions = unknown;
export function normalizeStaticProviderModelId(..._args: unknown[]): unknown {
  throw new Error("normalizeStaticProviderModelId not implemented (openclaw stub)");
}
export function normalizeConfiguredProviderCatalogModelId(..._args: unknown[]): unknown {
  throw new Error("normalizeConfiguredProviderCatalogModelId not implemented (openclaw stub)");
}
export function resolveStaticAllowlistModelKey(..._args: unknown[]): unknown {
  throw new Error("resolveStaticAllowlistModelKey not implemented (openclaw stub)");
}
export function formatLiteralProviderPrefixedModelRef(..._args: unknown[]): unknown {
  throw new Error("formatLiteralProviderPrefixedModelRef not implemented (openclaw stub)");
}
