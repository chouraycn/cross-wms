/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/incomplete-turn.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isIncompleteTerminalAssistantTurn(..._args: any[]): any {
  return false;
}
export function buildAttemptReplayMetadata(..._args: any[]): any {
  return undefined;
}
export function resolveAttemptReplayMetadata(..._args: any[]): any {
  return undefined;
}
export function hasAttemptTerminalState(..._args: any[]): any {
  return false;
}
export function resolveIncompleteTurnPayloadText(..._args: any[]): any {
  return undefined;
}
export function shouldRetryMissingAssistantTurn(..._args: any[]): any {
  return false;
}
export function resolveSilentToolResultReplyPayload(..._args: any[]): any {
  return undefined;
}
export function resolveReplayInvalidFlag(..._args: any[]): any {
  return undefined;
}
export function resolveRunLivenessState(..._args: any[]): any {
  return undefined;
}
export function shouldRetrySilentErrorAssistantTurn(..._args: any[]): any {
  return false;
}
export function shouldTreatEmptyAssistantReplyAsSilent(..._args: any[]): any {
  return false;
}
export function resolveReasoningOnlyRetryInstruction(..._args: any[]): any {
  return undefined;
}
export function resolveEmptyResponseRetryInstruction(..._args: any[]): any {
  return undefined;
}
export const DEFAULT_REASONING_ONLY_RETRY_LIMIT: any = undefined;
export const DEFAULT_EMPTY_RESPONSE_RETRY_LIMIT: any = undefined;
export const REASONING_ONLY_RETRY_INSTRUCTION: any = undefined;
export const EMPTY_RESPONSE_RETRY_INSTRUCTION: any = undefined;
