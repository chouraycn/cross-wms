/**
 * 移植自 openclaw/src/agents/model-selection-normalize.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ModelRef = unknown;
export type ModelManifestNormalizationContext = unknown;
export function modelKey(..._args: unknown[]): unknown {
  throw new Error("modelKey not implemented (openclaw stub)");
}
export function legacyModelKey(..._args: unknown[]): unknown {
  throw new Error("legacyModelKey not implemented (openclaw stub)");
}
export function normalizeProviderId(..._args: unknown[]): unknown {
  throw new Error("normalizeProviderId not implemented (openclaw stub)");
}
export function normalizeProviderIdForAuth(..._args: unknown[]): unknown {
  throw new Error("normalizeProviderIdForAuth not implemented (openclaw stub)");
}
export function findNormalizedProviderValue(..._args: unknown[]): unknown {
  throw new Error("findNormalizedProviderValue not implemented (openclaw stub)");
}
export function findNormalizedProviderKey(..._args: unknown[]): unknown {
  throw new Error("findNormalizedProviderKey not implemented (openclaw stub)");
}
export function normalizeModelRef(..._args: unknown[]): unknown {
  throw new Error("normalizeModelRef not implemented (openclaw stub)");
}
export function parseModelRef(..._args: unknown[]): unknown {
  throw new Error("parseModelRef not implemented (openclaw stub)");
}
