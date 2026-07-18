/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-manager.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type OAuthManagerAdapter = unknown;
export type ResolvedOAuthAccess = unknown;
export class OAuthManagerRefreshError {
  constructor(..._args: unknown[]) { throw new Error("OAuthManagerRefreshError not implemented (openclaw stub)"); }
}
export function resolveEffectiveOAuthCredential(..._args: unknown[]): unknown {
  throw new Error("resolveEffectiveOAuthCredential not implemented (openclaw stub)");
}
export function createOAuthManager(..._args: unknown[]): unknown {
  throw new Error("createOAuthManager not implemented (openclaw stub)");
}
