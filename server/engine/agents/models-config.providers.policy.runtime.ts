/**
 * 移植自 openclaw/src/agents/models-config.providers.policy.runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function applyProviderNativeStreamingUsagePolicy(..._args: unknown[]): unknown {
  throw new Error("applyProviderNativeStreamingUsagePolicy not implemented (openclaw stub)");
}
export function normalizeProviderConfigPolicy(..._args: unknown[]): unknown {
  throw new Error("normalizeProviderConfigPolicy not implemented (openclaw stub)");
}
export function resolveProviderConfigApiKeyPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveProviderConfigApiKeyPolicy not implemented (openclaw stub)");
}
