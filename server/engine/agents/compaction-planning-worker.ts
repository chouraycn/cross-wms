/**
 * 移植自 openclaw/src/agents/compaction-planning-worker.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const compactionPlanningWorkerTesting: unknown = undefined;
export async function buildSummaryChunksWithWorker(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildSummaryChunksWithWorker not implemented (openclaw stub)");
}
export async function buildOversizedFallbackPlanWithWorker(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildOversizedFallbackPlanWithWorker not implemented (openclaw stub)");
}
export async function buildStageSplitPlanWithWorker(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildStageSplitPlanWithWorker not implemented (openclaw stub)");
}
export async function buildHistoryPrunePlanWithWorker(..._args: unknown[]): Promise<unknown> {
  throw new Error("buildHistoryPrunePlanWithWorker not implemented (openclaw stub)");
}
export async function computeAdaptiveChunkRatioWithWorker(..._args: unknown[]): Promise<unknown> {
  throw new Error("computeAdaptiveChunkRatioWithWorker not implemented (openclaw stub)");
}
