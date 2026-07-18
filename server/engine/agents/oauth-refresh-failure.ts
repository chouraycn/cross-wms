/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-refresh-failure.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type OAuthRefreshFailureReason = unknown;
export class OAuthRefreshFailureError {
  constructor(..._args: unknown[]) { throw new Error("OAuthRefreshFailureError not implemented (openclaw stub)"); }
}
export function classifyOAuthRefreshFailureReason(..._args: unknown[]): unknown {
  throw new Error("classifyOAuthRefreshFailureReason not implemented (openclaw stub)");
}
export function classifyOAuthRefreshFailure(..._args: unknown[]): unknown {
  throw new Error("classifyOAuthRefreshFailure not implemented (openclaw stub)");
}
export function classifyOAuthRefreshFailureError(..._args: unknown[]): unknown {
  throw new Error("classifyOAuthRefreshFailureError not implemented (openclaw stub)");
}
export function buildOAuthRefreshFailureLoginCommand(..._args: unknown[]): unknown {
  throw new Error("buildOAuthRefreshFailureLoginCommand not implemented (openclaw stub)");
}
