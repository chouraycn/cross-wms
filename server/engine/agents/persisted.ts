/**
 * 移植自 openclaw/src/agents/auth-profiles/persisted.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function coercePersistedAuthProfileStore(..._args: unknown[]): unknown {
  throw new Error("coercePersistedAuthProfileStore not implemented (openclaw stub)");
}
export function mergeAuthProfileStores(..._args: unknown[]): unknown {
  throw new Error("mergeAuthProfileStores not implemented (openclaw stub)");
}
export function buildPersistedAuthProfileSecretsStore(..._args: unknown[]): unknown {
  throw new Error("buildPersistedAuthProfileSecretsStore not implemented (openclaw stub)");
}
export function applyLegacyAuthStore(..._args: unknown[]): unknown {
  throw new Error("applyLegacyAuthStore not implemented (openclaw stub)");
}
export function mergeOAuthFileIntoStore(..._args: unknown[]): unknown {
  throw new Error("mergeOAuthFileIntoStore not implemented (openclaw stub)");
}
export function loadPersistedAuthProfileStore(..._args: unknown[]): unknown {
  throw new Error("loadPersistedAuthProfileStore not implemented (openclaw stub)");
}
export function loadLegacyAuthProfileStore(..._args: unknown[]): unknown {
  throw new Error("loadLegacyAuthProfileStore not implemented (openclaw stub)");
}
