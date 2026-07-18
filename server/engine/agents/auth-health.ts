/**
 * 移植自 openclaw/src/agents/auth-health.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AuthProfileHealthStatus = unknown;
export type AuthProviderHealthStatus = unknown;
export type AuthProviderHealth = unknown;
export type AuthHealthSummary = unknown;
export const DEFAULT_OAUTH_WARN_MS: unknown = undefined;
export function formatRemainingShort(..._args: unknown[]): unknown {
  throw new Error("formatRemainingShort not implemented (openclaw stub)");
}
export function buildAuthHealthSummary(..._args: unknown[]): unknown {
  throw new Error("buildAuthHealthSummary not implemented (openclaw stub)");
}
