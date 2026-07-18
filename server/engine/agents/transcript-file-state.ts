/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/transcript-file-state.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type TranscriptPersistedEntry = unknown;
export class TranscriptFileState {
  constructor(..._args: unknown[]) { throw new Error("TranscriptFileState not implemented (openclaw stub)"); }
}
export function readTranscriptFileState(..._args: unknown[]): unknown {
  throw new Error("readTranscriptFileState not implemented (openclaw stub)");
}
export function writeTranscriptFileAtomic(..._args: unknown[]): unknown {
  throw new Error("writeTranscriptFileAtomic not implemented (openclaw stub)");
}
export function persistTranscriptStateMutation(..._args: unknown[]): unknown {
  throw new Error("persistTranscriptStateMutation not implemented (openclaw stub)");
}
