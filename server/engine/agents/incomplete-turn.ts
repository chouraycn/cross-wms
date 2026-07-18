/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/incomplete-turn.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function isIncompleteTerminalAssistantTurn(..._args: unknown[]): unknown {
  throw new Error("isIncompleteTerminalAssistantTurn not implemented (openclaw stub)");
}
export function buildAttemptReplayMetadata(..._args: unknown[]): unknown {
  throw new Error("buildAttemptReplayMetadata not implemented (openclaw stub)");
}
export function resolveAttemptReplayMetadata(..._args: unknown[]): unknown {
  throw new Error("resolveAttemptReplayMetadata not implemented (openclaw stub)");
}
export function hasAttemptTerminalState(..._args: unknown[]): unknown {
  throw new Error("hasAttemptTerminalState not implemented (openclaw stub)");
}
export function resolveIncompleteTurnPayloadText(..._args: unknown[]): unknown {
  throw new Error("resolveIncompleteTurnPayloadText not implemented (openclaw stub)");
}
export function shouldRetryMissingAssistantTurn(..._args: unknown[]): unknown {
  throw new Error("shouldRetryMissingAssistantTurn not implemented (openclaw stub)");
}
export function resolveSilentToolResultReplyPayload(..._args: unknown[]): unknown {
  throw new Error("resolveSilentToolResultReplyPayload not implemented (openclaw stub)");
}
export function resolveReplayInvalidFlag(..._args: unknown[]): unknown {
  throw new Error("resolveReplayInvalidFlag not implemented (openclaw stub)");
}
export function resolveRunLivenessState(..._args: unknown[]): unknown {
  throw new Error("resolveRunLivenessState not implemented (openclaw stub)");
}
export function shouldRetrySilentErrorAssistantTurn(..._args: unknown[]): unknown {
  throw new Error("shouldRetrySilentErrorAssistantTurn not implemented (openclaw stub)");
}
export function shouldTreatEmptyAssistantReplyAsSilent(..._args: unknown[]): unknown {
  throw new Error("shouldTreatEmptyAssistantReplyAsSilent not implemented (openclaw stub)");
}
export function resolveReasoningOnlyRetryInstruction(..._args: unknown[]): unknown {
  throw new Error("resolveReasoningOnlyRetryInstruction not implemented (openclaw stub)");
}
export function resolveEmptyResponseRetryInstruction(..._args: unknown[]): unknown {
  throw new Error("resolveEmptyResponseRetryInstruction not implemented (openclaw stub)");
}
export const DEFAULT_REASONING_ONLY_RETRY_LIMIT: unknown = undefined;
export const DEFAULT_EMPTY_RESPONSE_RETRY_LIMIT: unknown = undefined;
export const REASONING_ONLY_RETRY_INSTRUCTION: unknown = undefined;
export const EMPTY_RESPONSE_RETRY_INSTRUCTION: unknown = undefined;
