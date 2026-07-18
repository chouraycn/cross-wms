/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt-stage-timing.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function createEmbeddedRunStageTracker(..._args: unknown[]): unknown {
  throw new Error("createEmbeddedRunStageTracker not implemented (openclaw stub)");
}
export function shouldWarnEmbeddedRunStageSummary(..._args: unknown[]): unknown {
  throw new Error("shouldWarnEmbeddedRunStageSummary not implemented (openclaw stub)");
}
export function formatEmbeddedRunStageSummary(..._args: unknown[]): unknown {
  throw new Error("formatEmbeddedRunStageSummary not implemented (openclaw stub)");
}
export const EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE: unknown = undefined;
