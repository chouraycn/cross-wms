/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-identity.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type OAuthMirrorDecisionReason = unknown;
export type OAuthMirrorDecision = unknown;
export function normalizeAuthIdentityToken(..._args: unknown[]): unknown {
  throw new Error("normalizeAuthIdentityToken not implemented (openclaw stub)");
}
export function normalizeAuthEmailToken(..._args: unknown[]): unknown {
  throw new Error("normalizeAuthEmailToken not implemented (openclaw stub)");
}
export function isSameOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("isSameOAuthIdentity not implemented (openclaw stub)");
}
export function isSafeToCopyOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("isSafeToCopyOAuthIdentity not implemented (openclaw stub)");
}
export function shouldMirrorRefreshedOAuthCredential(..._args: unknown[]): unknown {
  throw new Error("shouldMirrorRefreshedOAuthCredential not implemented (openclaw stub)");
}
