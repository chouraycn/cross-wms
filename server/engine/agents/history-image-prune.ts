/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/history-image-prune.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function pruneProcessedHistoryImages(..._args: unknown[]): unknown {
  throw new Error("pruneProcessedHistoryImages not implemented (openclaw stub)");
}
export function installHistoryImagePruneContextTransform(..._args: unknown[]): unknown {
  throw new Error("installHistoryImagePruneContextTransform not implemented (openclaw stub)");
}
export const PRUNED_HISTORY_IMAGE_MARKER: unknown = undefined;
export const PRUNED_HISTORY_MEDIA_REFERENCE_MARKER: unknown = undefined;
