/**
 * 移植自 openclaw/src/agents/session-suspension.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SessionSuspensionReason = unknown;
export type SessionSuspensionTarget = unknown;
export type SessionSuspensionParams = unknown;
export const DEFAULT_QUOTA_SUSPENSION_RESUME_MS: unknown = undefined;
export const testing: unknown = undefined;
export function resolveSessionSuspensionReason(..._args: unknown[]): unknown {
  throw new Error("resolveSessionSuspensionReason not implemented (openclaw stub)");
}
export function runWithDeferredSessionSuspension(..._args: unknown[]): unknown {
  throw new Error("runWithDeferredSessionSuspension not implemented (openclaw stub)");
}
export function resolveSessionSuspensionTarget(..._args: unknown[]): unknown {
  throw new Error("resolveSessionSuspensionTarget not implemented (openclaw stub)");
}
export async function suspendSession(..._args: unknown[]): Promise<unknown> {
  throw new Error("suspendSession not implemented (openclaw stub)");
}
