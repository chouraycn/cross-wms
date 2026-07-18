/**
 * 移植自 openclaw/src/agents/auth-profiles/order.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AuthProfileEligibilityReasonCode = unknown;
export function isStoredCredentialCompatibleWithAuthProvider(..._args: unknown[]): unknown {
  throw new Error("isStoredCredentialCompatibleWithAuthProvider not implemented (openclaw stub)");
}
export function isConfiguredAwsSdkAuthProfileForProvider(..._args: unknown[]): unknown {
  throw new Error("isConfiguredAwsSdkAuthProfileForProvider not implemented (openclaw stub)");
}
export function resolveAuthProfileEligibility(..._args: unknown[]): unknown {
  throw new Error("resolveAuthProfileEligibility not implemented (openclaw stub)");
}
export function resolveAuthProfileOrder(..._args: unknown[]): unknown {
  throw new Error("resolveAuthProfileOrder not implemented (openclaw stub)");
}
