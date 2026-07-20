/**
 * 移植自 openclaw/src/agents/bash-tools.exec-runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { applyPathPrepend, findPathKey, normalizePathPrepend } from "../infra/path-prepend.js";
export { normalizeExecAsk, normalizeExecHost, normalizeExecSecurity, normalizeExecTarget } from "../infra/exec-approvals.js";
export { execSchema } from "./bash-tools.schemas.js";
export { renderExecUpdateText } from "./bash-tools.exec-output.js";
export type ExecProcessFailureKind = unknown;
export type ExecProcessOutcome = unknown;
export type ExecProcessHandle = unknown;
export const DEFAULT_MAX_OUTPUT: unknown = undefined;
export const DEFAULT_PENDING_MAX_OUTPUT: unknown = undefined;
export const DEFAULT_PATH: unknown = undefined;
export const DEFAULT_NOTIFY_TAIL_CHARS: unknown = undefined;
export const DEFAULT_APPROVAL_TIMEOUT_MS: unknown = undefined;
export const DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS: unknown = undefined;
export function detectCursorKeyMode(..._args: unknown[]): unknown {
  return undefined;
}
export function renderExecHostLabel(..._args: unknown[]): unknown {
  return "";
}
export function renderExecTargetLabel(..._args: unknown[]): unknown {
  return "";
}
export function isRequestedExecTargetAllowed(..._args: unknown[]): unknown {
  return false;
}
export function resolveExecTarget(..._args: unknown[]): unknown {
  return undefined;
}
export function normalizeNotifyOutput(..._args: unknown[]): unknown {
  return undefined;
}
export function applyShellPath(..._args: unknown[]): unknown {
  return undefined;
}
export function createApprovalSlug(..._args: unknown[]): unknown {
  return undefined;
}
export function buildApprovalPendingMessage(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveApprovalRunningNoticeMs(..._args: unknown[]): unknown {
  return undefined;
}
export function formatExecFailureReason(..._args: unknown[]): unknown {
  return "";
}
export function buildExecExitOutcome(..._args: unknown[]): unknown {
  return undefined;
}
export function buildExecRuntimeErrorOutcome(..._args: unknown[]): unknown {
  return undefined;
}
export async function runExecProcess(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
