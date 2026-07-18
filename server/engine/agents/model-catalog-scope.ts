/**
 * 移植自 openclaw/src/agents/model-catalog-scope.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveModelCatalogScope(..._args: unknown[]): unknown {
  throw new Error("resolveModelCatalogScope not implemented (openclaw stub)");
}
export function resolveProviderDiscoveryProviderIdsForCatalogScope(..._args: unknown[]): unknown {
  throw new Error("resolveProviderDiscoveryProviderIdsForCatalogScope not implemented (openclaw stub)");
}
