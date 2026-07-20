/**
 * 移植自 openclaw/src/agents/tools/web-guarded-fetch.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function fetchWithWebToolsNetworkGuard(..._args: unknown[]): unknown {
  return undefined;
}
export function withTrustedWebToolsEndpoint(..._args: unknown[]): unknown {
  return undefined;
}
export function withSelfHostedWebToolsEndpoint(..._args: unknown[]): unknown {
  return undefined;
}
export function withStrictWebToolsEndpoint(..._args: unknown[]): unknown {
  return undefined;
}
