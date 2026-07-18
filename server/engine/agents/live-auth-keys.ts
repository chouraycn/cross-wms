/**
 * 移植自 openclaw/src/agents/live-auth-keys.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function collectProviderApiKeys(..._args: unknown[]): unknown {
  throw new Error("collectProviderApiKeys not implemented (openclaw stub)");
}
export function collectAnthropicApiKeys(..._args: unknown[]): unknown {
  throw new Error("collectAnthropicApiKeys not implemented (openclaw stub)");
}
export function isApiKeyRateLimitError(..._args: unknown[]): unknown {
  throw new Error("isApiKeyRateLimitError not implemented (openclaw stub)");
}
export function isAnthropicBillingError(..._args: unknown[]): unknown {
  throw new Error("isAnthropicBillingError not implemented (openclaw stub)");
}
