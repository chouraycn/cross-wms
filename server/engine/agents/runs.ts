/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/runs.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type EmbeddedAgentQueueFailureReason = unknown;
export type EmbeddedAgentQueueMessageOutcome = unknown;
export type AbortAndDrainEmbeddedAgentRunResult = unknown;
export function formatEmbeddedAgentQueueFailureSummary(..._args: unknown[]): unknown {
  throw new Error("formatEmbeddedAgentQueueFailureSummary not implemented (openclaw stub)");
}
export function clearEmbeddedRunAbandonment(..._args: unknown[]): unknown {
  throw new Error("clearEmbeddedRunAbandonment not implemented (openclaw stub)");
}
export function markEmbeddedRunAbandoned(..._args: unknown[]): unknown {
  throw new Error("markEmbeddedRunAbandoned not implemented (openclaw stub)");
}
export function markActiveEmbeddedRunAbandoned(..._args: unknown[]): unknown {
  throw new Error("markActiveEmbeddedRunAbandoned not implemented (openclaw stub)");
}
export function isEmbeddedRunAbandoned(..._args: unknown[]): unknown {
  throw new Error("isEmbeddedRunAbandoned not implemented (openclaw stub)");
}
export function queueEmbeddedAgentMessage(..._args: unknown[]): unknown {
  throw new Error("queueEmbeddedAgentMessage not implemented (openclaw stub)");
}
export function queueEmbeddedAgentMessageWithOutcome(..._args: unknown[]): unknown {
  throw new Error("queueEmbeddedAgentMessageWithOutcome not implemented (openclaw stub)");
}
export function queueEmbeddedAgentMessageWithOutcomeAsync(..._args: unknown[]): unknown {
  throw new Error("queueEmbeddedAgentMessageWithOutcomeAsync not implemented (openclaw stub)");
}
export function abortEmbeddedAgentRun(..._args: unknown[]): unknown {
  throw new Error("abortEmbeddedAgentRun not implemented (openclaw stub)");
}
export function isEmbeddedAgentRunActive(..._args: unknown[]): unknown {
  throw new Error("isEmbeddedAgentRunActive not implemented (openclaw stub)");
}
export function isEmbeddedAgentRunHandleActive(..._args: unknown[]): unknown {
  throw new Error("isEmbeddedAgentRunHandleActive not implemented (openclaw stub)");
}
export function isEmbeddedAgentRunAbortableForCompaction(..._args: unknown[]): unknown {
  throw new Error("isEmbeddedAgentRunAbortableForCompaction not implemented (openclaw stub)");
}
export function isEmbeddedAgentRunStreaming(..._args: unknown[]): unknown {
  throw new Error("isEmbeddedAgentRunStreaming not implemented (openclaw stub)");
}
export function resolveActiveEmbeddedRunHandleSessionId(..._args: unknown[]): unknown {
  throw new Error("resolveActiveEmbeddedRunHandleSessionId not implemented (openclaw stub)");
}
export function resolveActiveEmbeddedRunHandleSessionIdBySessionFile(..._args: unknown[]): unknown {
  throw new Error("resolveActiveEmbeddedRunHandleSessionIdBySessionFile not implemented (openclaw stub)");
}
export function resolveActiveEmbeddedRunSessionIdBySessionFile(..._args: unknown[]): unknown {
  throw new Error("resolveActiveEmbeddedRunSessionIdBySessionFile not implemented (openclaw stub)");
}
export function getActiveEmbeddedRunSnapshot(..._args: unknown[]): unknown {
  throw new Error("getActiveEmbeddedRunSnapshot not implemented (openclaw stub)");
}
export function waitForActiveEmbeddedRuns(..._args: unknown[]): unknown {
  throw new Error("waitForActiveEmbeddedRuns not implemented (openclaw stub)");
}
export function waitForEmbeddedAgentRunEnd(..._args: unknown[]): unknown {
  throw new Error("waitForEmbeddedAgentRunEnd not implemented (openclaw stub)");
}
export function abortAndDrainEmbeddedAgentRun(..._args: unknown[]): unknown {
  throw new Error("abortAndDrainEmbeddedAgentRun not implemented (openclaw stub)");
}
export function setActiveEmbeddedRun(..._args: unknown[]): unknown {
  throw new Error("setActiveEmbeddedRun not implemented (openclaw stub)");
}
export function updateActiveEmbeddedRunSnapshot(..._args: unknown[]): unknown {
  throw new Error("updateActiveEmbeddedRunSnapshot not implemented (openclaw stub)");
}
export function updateActiveEmbeddedRunSessionFile(..._args: unknown[]): unknown {
  throw new Error("updateActiveEmbeddedRunSessionFile not implemented (openclaw stub)");
}
export function clearActiveEmbeddedRun(..._args: unknown[]): unknown {
  throw new Error("clearActiveEmbeddedRun not implemented (openclaw stub)");
}
export function forceClearEmbeddedAgentRun(..._args: unknown[]): unknown {
  throw new Error("forceClearEmbeddedAgentRun not implemented (openclaw stub)");
}
export const testing_runs: unknown = undefined;
