/**
 * 移植自 openclaw/src/agents/bash-tools.exec-approval-request.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExecApprovalRegistration = unknown;
export async function registerExecApprovalRequest(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function resolveRegisteredExecApprovalDecision(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export function buildExecApprovalRequesterContext(..._args: unknown[]): unknown {
  return undefined;
}
export function buildExecApprovalTurnSourceContext(..._args: unknown[]): unknown {
  return undefined;
}
export async function registerExecApprovalRequestForHost(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
export async function registerExecApprovalRequestForHostOrThrow(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
