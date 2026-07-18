/**
 * 移植自 openclaw/src/agents/compaction.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CompactionSummarizationInstructions = unknown;
export function buildCompactionSummarizationInstructions(..._args: unknown[]): unknown {
  throw new Error("buildCompactionSummarizationInstructions not implemented (openclaw stub)");
}
export async function summarizeWithFallback(..._args: unknown[]): Promise<unknown> {
  throw new Error("summarizeWithFallback not implemented (openclaw stub)");
}
export async function summarizeInStages(..._args: unknown[]): Promise<unknown> {
  throw new Error("summarizeInStages not implemented (openclaw stub)");
}
export function resolveContextWindowTokens(..._args: unknown[]): unknown {
  throw new Error("resolveContextWindowTokens not implemented (openclaw stub)");
}
