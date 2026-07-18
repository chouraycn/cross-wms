/**
 * 移植自 openclaw/src/agents/auth-profiles/path-resolve.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveAuthStorePath(..._args: unknown[]): unknown {
  throw new Error("resolveAuthStorePath not implemented (openclaw stub)");
}
export function resolveLegacyAuthStorePath(..._args: unknown[]): unknown {
  throw new Error("resolveLegacyAuthStorePath not implemented (openclaw stub)");
}
export function resolveAuthStatePath(..._args: unknown[]): unknown {
  throw new Error("resolveAuthStatePath not implemented (openclaw stub)");
}
export function resolveAuthStorePathForDisplay(..._args: unknown[]): unknown {
  throw new Error("resolveAuthStorePathForDisplay not implemented (openclaw stub)");
}
export function resolveAuthStatePathForDisplay(..._args: unknown[]): unknown {
  throw new Error("resolveAuthStatePathForDisplay not implemented (openclaw stub)");
}
export function resolveOAuthRefreshLockPath(..._args: unknown[]): unknown {
  throw new Error("resolveOAuthRefreshLockPath not implemented (openclaw stub)");
}
