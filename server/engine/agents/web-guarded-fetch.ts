/**
 * 移植自 openclaw/src/agents/tools/web-guarded-fetch.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function fetchWithWebToolsNetworkGuard(..._args: unknown[]): unknown {
  throw new Error("fetchWithWebToolsNetworkGuard not implemented (openclaw stub)");
}
export function withTrustedWebToolsEndpoint(..._args: unknown[]): unknown {
  throw new Error("withTrustedWebToolsEndpoint not implemented (openclaw stub)");
}
export function withSelfHostedWebToolsEndpoint(..._args: unknown[]): unknown {
  throw new Error("withSelfHostedWebToolsEndpoint not implemented (openclaw stub)");
}
export function withStrictWebToolsEndpoint(..._args: unknown[]): unknown {
  throw new Error("withStrictWebToolsEndpoint not implemented (openclaw stub)");
}
