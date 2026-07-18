/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isRefreshTokenReusedError(..._args: unknown[]): unknown {
  throw new Error("isRefreshTokenReusedError not implemented (openclaw stub)");
}
export function refreshOAuthCredentialForRuntime(..._args: unknown[]): unknown {
  throw new Error("refreshOAuthCredentialForRuntime not implemented (openclaw stub)");
}
export function resetOAuthRefreshQueuesForTest(..._args: unknown[]): unknown {
  throw new Error("resetOAuthRefreshQueuesForTest not implemented (openclaw stub)");
}
export function resolveApiKeyForProfile(..._args: unknown[]): unknown {
  throw new Error("resolveApiKeyForProfile not implemented (openclaw stub)");
}
