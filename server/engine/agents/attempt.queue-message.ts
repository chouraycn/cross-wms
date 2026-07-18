/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.queue-message.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type EmbeddedAgentActiveSessionSteerTarget = unknown;
export function cancelQueuedSteeringMessage(..._args: unknown[]): unknown {
  throw new Error("cancelQueuedSteeringMessage not implemented (openclaw stub)");
}
export function steerAndWaitForTranscriptCommit(..._args: unknown[]): unknown {
  throw new Error("steerAndWaitForTranscriptCommit not implemented (openclaw stub)");
}
export function steerActiveSessionWithOptionalDeliveryWait(..._args: unknown[]): unknown {
  throw new Error("steerActiveSessionWithOptionalDeliveryWait not implemented (openclaw stub)");
}
