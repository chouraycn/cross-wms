/**
 * 移植自 openclaw/src/agents/mcp-http-fetch.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function buildMcpHttpFetch(..._args: unknown[]): unknown {
  throw new Error("buildMcpHttpFetch not implemented (openclaw stub)");
}
export function withoutMcpAuthorizationHeader(..._args: unknown[]): unknown {
  throw new Error("withoutMcpAuthorizationHeader not implemented (openclaw stub)");
}
export function withSameOriginMcpHttpHeaders(..._args: unknown[]): unknown {
  throw new Error("withSameOriginMcpHttpHeaders not implemented (openclaw stub)");
}
