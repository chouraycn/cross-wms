/**
 * 移植自 openclaw/src/agents/auth-profiles/profile-list.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function dedupeProfileIds(..._args: unknown[]): unknown {
  throw new Error("dedupeProfileIds not implemented (openclaw stub)");
}
export function listProfilesForProvider(..._args: unknown[]): unknown {
  throw new Error("listProfilesForProvider not implemented (openclaw stub)");
}
export function resolveSubscriptionAuthModeForProfiles(..._args: unknown[]): unknown {
  throw new Error("resolveSubscriptionAuthModeForProfiles not implemented (openclaw stub)");
}
