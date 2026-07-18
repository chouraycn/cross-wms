/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type RuntimeExternalOAuthProfile = unknown;
export function areOAuthCredentialsEquivalent(..._args: unknown[]): unknown {
  throw new Error("areOAuthCredentialsEquivalent not implemented (openclaw stub)");
}
export function shouldReplaceStoredOAuthCredential(..._args: unknown[]): unknown {
  throw new Error("shouldReplaceStoredOAuthCredential not implemented (openclaw stub)");
}
export function hasUsableOAuthCredential(..._args: unknown[]): unknown {
  throw new Error("hasUsableOAuthCredential not implemented (openclaw stub)");
}
export function hasOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("hasOAuthIdentity not implemented (openclaw stub)");
}
export function hasMatchingOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("hasMatchingOAuthIdentity not implemented (openclaw stub)");
}
export function isSafeToOverwriteStoredOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("isSafeToOverwriteStoredOAuthIdentity not implemented (openclaw stub)");
}
export function isSafeToAdoptBootstrapOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("isSafeToAdoptBootstrapOAuthIdentity not implemented (openclaw stub)");
}
export function isSafeToAdoptMainStoreOAuthIdentity(..._args: unknown[]): unknown {
  throw new Error("isSafeToAdoptMainStoreOAuthIdentity not implemented (openclaw stub)");
}
export function shouldBootstrapFromExternalCliCredential(..._args: unknown[]): unknown {
  throw new Error("shouldBootstrapFromExternalCliCredential not implemented (openclaw stub)");
}
export function overlayRuntimeExternalOAuthProfiles(..._args: unknown[]): unknown {
  throw new Error("overlayRuntimeExternalOAuthProfiles not implemented (openclaw stub)");
}
export function shouldPersistRuntimeExternalOAuthProfile(..._args: unknown[]): unknown {
  throw new Error("shouldPersistRuntimeExternalOAuthProfile not implemented (openclaw stub)");
}
