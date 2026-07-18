/**
 * 移植自 openclaw/src/agents/agent-steering-queue.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function listPendingAgentSteeringItemsFromSubagentRuns(..._args: unknown[]): unknown {
  throw new Error("listPendingAgentSteeringItemsFromSubagentRuns not implemented (openclaw stub)");
}
export function buildMergedAgentSteeringPrompt(..._args: unknown[]): unknown {
  throw new Error("buildMergedAgentSteeringPrompt not implemented (openclaw stub)");
}
export function leasePendingAgentSteeringItemsFromSubagentRuns(..._args: unknown[]): unknown {
  throw new Error("leasePendingAgentSteeringItemsFromSubagentRuns not implemented (openclaw stub)");
}
export function ackLeasedAgentSteeringItemsFromSubagentRuns(..._args: unknown[]): unknown {
  throw new Error("ackLeasedAgentSteeringItemsFromSubagentRuns not implemented (openclaw stub)");
}
export function releaseLeasedAgentSteeringItemsFromSubagentRuns(..._args: unknown[]): unknown {
  throw new Error("releaseLeasedAgentSteeringItemsFromSubagentRuns not implemented (openclaw stub)");
}
export function prependAgentSteeringPrompt(..._args: unknown[]): unknown {
  throw new Error("prependAgentSteeringPrompt not implemented (openclaw stub)");
}
