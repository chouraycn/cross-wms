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
  throw new Error("createExecApprovalPendingState not implemented (openclaw stub)");
}
export function createExecApprovalRequestState(..._args: unknown[]): unknown {
  throw new Error("createExecApprovalRequestState not implemented (openclaw stub)");
}
export function createExecApprovalRequestContext(..._args: unknown[]): unknown {
  throw new Error("createExecApprovalRequestContext not implemented (openclaw stub)");
}
export function createDefaultExecApprovalRequestContext(..._args: unknown[]): unknown {
  throw new Error("createDefaultExecApprovalRequestContext not implemented (openclaw stub)");
}
export function resolveBaseExecApprovalDecision(..._args: unknown[]): unknown {
  throw new Error("resolveBaseExecApprovalDecision not implemented (openclaw stub)");
}
export function resolveExecHostApprovalContext(..._args: unknown[]): unknown {
  throw new Error("resolveExecHostApprovalContext not implemented (openclaw stub)");
}
export async function resolveApprovalDecisionOrUndefined(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveApprovalDecisionOrUndefined not implemented (openclaw stub)");
}
export function resolveExecApprovalUnavailableState(..._args: unknown[]): unknown {
  throw new Error("resolveExecApprovalUnavailableState not implemented (openclaw stub)");
}
export async function createAndRegisterDefaultExecApprovalRequest(..._args: unknown[]): Promise<unknown> {
  throw new Error("createAndRegisterDefaultExecApprovalRequest not implemented (openclaw stub)");
}
export function buildDefaultExecApprovalRequestArgs(..._args: unknown[]): unknown {
  throw new Error("buildDefaultExecApprovalRequestArgs not implemented (openclaw stub)");
}
export function buildExecApprovalFollowupTarget(..._args: unknown[]): unknown {
  throw new Error("buildExecApprovalFollowupTarget not implemented (openclaw stub)");
}
export function createExecApprovalDecisionState(..._args: unknown[]): unknown {
  throw new Error("createExecApprovalDecisionState not implemented (openclaw stub)");
}
export function enforceStrictInlineEvalApprovalBoundary(..._args: unknown[]): unknown {
  throw new Error("enforceStrictInlineEvalApprovalBoundary not implemented (openclaw stub)");
}
export function shouldResolveExecApprovalUnavailableInline(..._args: unknown[]): unknown {
  throw new Error("shouldResolveExecApprovalUnavailableInline not implemented (openclaw stub)");
}
export function buildHeadlessExecApprovalDeniedMessage(..._args: unknown[]): unknown {
  throw new Error("buildHeadlessExecApprovalDeniedMessage not implemented (openclaw stub)");
}
export async function sendExecApprovalFollowupResult(..._args: unknown[]): Promise<unknown> {
  throw new Error("sendExecApprovalFollowupResult not implemented (openclaw stub)");
}
export function buildExecApprovalPendingToolResult(..._args: unknown[]): unknown {
  throw new Error("buildExecApprovalPendingToolResult not implemented (openclaw stub)");
}
