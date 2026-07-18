/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compaction-successor-transcript.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CompactionTranscriptRotation = unknown;
export function shouldRotateCompactionTranscript(..._args: unknown[]): unknown {
  throw new Error("shouldRotateCompactionTranscript not implemented (openclaw stub)");
}
export function rotateTranscriptAfterCompaction(..._args: unknown[]): unknown {
  throw new Error("rotateTranscriptAfterCompaction not implemented (openclaw stub)");
}
export function rotateTranscriptFileAfterCompaction(..._args: unknown[]): unknown {
  throw new Error("rotateTranscriptFileAfterCompaction not implemented (openclaw stub)");
}
