/**
 * 移植自 openclaw/src/agents/auth-profiles/usage-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isAuthCooldownBypassedForProvider(..._args: unknown[]): unknown {
  throw new Error("isAuthCooldownBypassedForProvider not implemented (openclaw stub)");
}
export function isModelScopedCooldownReason(..._args: unknown[]): unknown {
  throw new Error("isModelScopedCooldownReason not implemented (openclaw stub)");
}
export function resolveProfileUnusableUntil(..._args: unknown[]): unknown {
  throw new Error("resolveProfileUnusableUntil not implemented (openclaw stub)");
}
export function isActiveUnusableWindow(..._args: unknown[]): unknown {
  throw new Error("isActiveUnusableWindow not implemented (openclaw stub)");
}
export function isProfileInCooldown(..._args: unknown[]): unknown {
  throw new Error("isProfileInCooldown not implemented (openclaw stub)");
}
export function getSoonestCooldownExpiry(..._args: unknown[]): unknown {
  throw new Error("getSoonestCooldownExpiry not implemented (openclaw stub)");
}
export function clearExpiredCooldowns(..._args: unknown[]): unknown {
  throw new Error("clearExpiredCooldowns not implemented (openclaw stub)");
}
