/**
 * 移植自 openclaw/src/agents/compaction-planning.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type StageSplitPlan = unknown;
export type OversizedFallbackPlan = unknown;
export type HistoryPrunePlan = unknown;
export const BASE_CHUNK_RATIO: unknown = undefined;
export const MIN_CHUNK_RATIO: unknown = undefined;
export const SAFETY_MARGIN: unknown = undefined;
export const SUMMARIZATION_OVERHEAD_TOKENS: unknown = undefined;
export function estimateMessagesTokens(..._args: unknown[]): unknown {
  throw new Error("estimateMessagesTokens not implemented (openclaw stub)");
}
export function sanitizeCompactionMessages(..._args: unknown[]): unknown {
  throw new Error("sanitizeCompactionMessages not implemented (openclaw stub)");
}
export function estimateCompactionMessageTokens(..._args: unknown[]): unknown {
  throw new Error("estimateCompactionMessageTokens not implemented (openclaw stub)");
}
export function normalizeCompactionParts(..._args: unknown[]): unknown {
  throw new Error("normalizeCompactionParts not implemented (openclaw stub)");
}
export function splitMessagesByTokenShare(..._args: unknown[]): unknown {
  throw new Error("splitMessagesByTokenShare not implemented (openclaw stub)");
}
export function chunkMessagesByMaxTokens(..._args: unknown[]): unknown {
  throw new Error("chunkMessagesByMaxTokens not implemented (openclaw stub)");
}
export function computeAdaptiveChunkRatio(..._args: unknown[]): unknown {
  throw new Error("computeAdaptiveChunkRatio not implemented (openclaw stub)");
}
export function isOversizedForSummary(..._args: unknown[]): unknown {
  throw new Error("isOversizedForSummary not implemented (openclaw stub)");
}
export function buildSummaryChunks(..._args: unknown[]): unknown {
  throw new Error("buildSummaryChunks not implemented (openclaw stub)");
}
export function buildOversizedFallbackPlan(..._args: unknown[]): unknown {
  throw new Error("buildOversizedFallbackPlan not implemented (openclaw stub)");
}
export function buildStageSplitPlan(..._args: unknown[]): unknown {
  throw new Error("buildStageSplitPlan not implemented (openclaw stub)");
}
export function pruneHistoryForContextShare(..._args: unknown[]): unknown {
  throw new Error("pruneHistoryForContextShare not implemented (openclaw stub)");
}
export function buildHistoryPrunePlan(..._args: unknown[]): unknown {
  throw new Error("buildHistoryPrunePlan not implemented (openclaw stub)");
}
