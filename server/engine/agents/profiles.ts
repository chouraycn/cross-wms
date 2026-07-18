/**
 * 移植自 openclaw/src/agents/auth-profiles/profiles.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function setAuthProfileOrder(..._args: unknown[]): unknown {
  throw new Error("setAuthProfileOrder not implemented (openclaw stub)");
}
export function promoteAuthProfileInOrder(..._args: unknown[]): unknown {
  throw new Error("promoteAuthProfileInOrder not implemented (openclaw stub)");
}
export function upsertAuthProfile(..._args: unknown[]): unknown {
  throw new Error("upsertAuthProfile not implemented (openclaw stub)");
}
export function upsertAuthProfileWithLock(..._args: unknown[]): unknown {
  throw new Error("upsertAuthProfileWithLock not implemented (openclaw stub)");
}
export function removeProviderAuthProfilesWithLock(..._args: unknown[]): unknown {
  throw new Error("removeProviderAuthProfilesWithLock not implemented (openclaw stub)");
}
export function clearLastGoodProfileWithLock(..._args: unknown[]): unknown {
  throw new Error("clearLastGoodProfileWithLock not implemented (openclaw stub)");
}
export function markAuthProfileSuccess(..._args: unknown[]): unknown {
  throw new Error("markAuthProfileSuccess not implemented (openclaw stub)");
}
