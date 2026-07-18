/**
 * 移植自 openclaw/src/agents/live-test-provider-drift.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isLiveAuthDrift(..._args: unknown[]): unknown {
  throw new Error("isLiveAuthDrift not implemented (openclaw stub)");
}
export function isLiveBillingDrift(..._args: unknown[]): unknown {
  throw new Error("isLiveBillingDrift not implemented (openclaw stub)");
}
export function isLiveRateLimitDrift(..._args: unknown[]): unknown {
  throw new Error("isLiveRateLimitDrift not implemented (openclaw stub)");
}
export function isLiveProviderUnavailableDrift(..._args: unknown[]): unknown {
  throw new Error("isLiveProviderUnavailableDrift not implemented (openclaw stub)");
}
export function shouldSkipLiveProviderDrift(..._args: unknown[]): unknown {
  throw new Error("shouldSkipLiveProviderDrift not implemented (openclaw stub)");
}
