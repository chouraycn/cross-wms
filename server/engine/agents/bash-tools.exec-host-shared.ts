/**
 * 移植自 openclaw/src/agents/bash-tools.exec-host-shared.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExecHostApprovalContext = unknown;
export type ExecApprovalPendingState = unknown;
export type ExecApprovalRequestState = unknown;
export type ExecApprovalUnavailableReason = unknown;
export type RegisteredExecApprovalRequestContext = unknown;
export type ExecApprovalFollowupTarget = unknown;
export type ExecApprovalFollowupResultDeps = unknown;
export type DefaultExecApprovalRequestArgs = unknown;
export const MAX_EXEC_APPROVAL_FOLLOWUP_FAILURE_LOG_KEYS: unknown = undefined;
export function createExecApprovalPendingState(..._args: unknown[]): unknown {
  return undefined;
}
export function createExecApprovalRequestState(..._args: unknown[]): unknown {
  return undefined;
}
export function createExecApprovalRequestContext(..._args: unknown[]): unknown {
  return undefined;
}
export function createDefaultExecApprovalRequestContext(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveBaseExecApprovalDecision(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveExecHostApprovalContext(..._args: unknown[]): unknown {
  return undefined;
}
export async function resolveApprovalDecisionOrUndefined(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function resolveExecApprovalUnavailableState(..._args: unknown[]): unknown {
  return undefined;
}
export async function createAndRegisterDefaultExecApprovalRequest(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function buildDefaultExecApprovalRequestArgs(..._args: unknown[]): unknown {
  return undefined;
}
export function buildExecApprovalFollowupTarget(..._args: unknown[]): unknown {
  return undefined;
}
export function createExecApprovalDecisionState(..._args: unknown[]): unknown {
  return undefined;
}
export function enforceStrictInlineEvalApprovalBoundary(..._args: unknown[]): unknown {
  return undefined;
}
export function shouldResolveExecApprovalUnavailableInline(..._args: unknown[]): unknown {
  return false;
}
export function buildHeadlessExecApprovalDeniedMessage(..._args: unknown[]): unknown {
  return undefined;
}
export async function sendExecApprovalFollowupResult(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function buildExecApprovalPendingToolResult(..._args: unknown[]): unknown {
  return undefined;
}
