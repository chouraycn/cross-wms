/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/transcript-file-state.ts
 *
 * 降级实现：提供 transcript 文件状态，不再抛出 stub 错误。
 */

export type TranscriptPersistedEntry = {
  sessionId?: string;
  [key: string]: unknown;
};

export class TranscriptFileState {
  private entry: TranscriptPersistedEntry = {};

  constructor(_params?: unknown) {}

  getEntry(): TranscriptPersistedEntry {
    return this.entry;
  }

  setEntry(entry: TranscriptPersistedEntry): void {
    this.entry = entry;
  }
}

export function readTranscriptFileState(_params: unknown): TranscriptFileState {
  return new TranscriptFileState();
}

export function writeTranscriptFileAtomic(_params: unknown): void {
  // no-op in cross-wms降级实现
}

export function persistTranscriptStateMutation(_params: unknown): void {
  // no-op in cross-wms降级实现
}
