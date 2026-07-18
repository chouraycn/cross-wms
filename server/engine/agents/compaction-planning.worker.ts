/**
 * 移植自 openclaw/src/agents/compaction-planning.worker.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CompactionPlanningWorkerInput = unknown;
export type CompactionPlanningWorkerValue = unknown;
export type CompactionPlanningWorkerResult = unknown;
export function runCompactionPlanningWorkerInput(..._args: unknown[]): unknown {
  throw new Error("runCompactionPlanningWorkerInput not implemented (openclaw stub)");
}
