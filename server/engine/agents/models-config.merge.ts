/**
 * 移植自 openclaw/src/agents/models-config.merge.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExistingProviderConfig = unknown;
export function mergeProviderModels(..._args: unknown[]): unknown {
  throw new Error("mergeProviderModels not implemented (openclaw stub)");
}
export function mergeProviders(..._args: unknown[]): unknown {
  throw new Error("mergeProviders not implemented (openclaw stub)");
}
export function mergeWithExistingProviderSecrets(..._args: unknown[]): unknown {
  throw new Error("mergeWithExistingProviderSecrets not implemented (openclaw stub)");
}
