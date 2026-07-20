/**
 * Compaction successor transcript rotation.
 * Ported from openclaw/src/agents/embedded-agent-runner/compaction-successor-transcript.ts
 */

export type CompactionTranscriptRotation = {
  rotated: boolean;
  reason?: string;
  sessionId?: string;
  sessionFile?: string;
  compactionEntryId?: string;
  leafId?: string;
  entriesWritten?: number;
};

/** Check whether compaction transcript rotation is configured. */
export function shouldRotateCompactionTranscript(config?: unknown): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }
  const cfg = config as { agents?: { defaults?: { compaction?: { truncateAfterCompaction?: boolean } } } };
  return cfg.agents?.defaults?.compaction?.truncateAfterCompaction === true;
}

/** Rotate transcript after compaction using a session manager. */
export async function rotateTranscriptAfterCompaction(params: {
  sessionManager: unknown;
  sessionFile: string;
  now?: () => Date;
}): Promise<CompactionTranscriptRotation> {
  const sessionFile = params.sessionFile?.trim();
  if (!sessionFile) {
    return { rotated: false, reason: "missing session file" };
  }
  // Full rotation requires session infrastructure not available in cross-wms
  return { rotated: false, reason: "rotation not available" };
}

/** Rotate transcript file after compaction. */
export async function rotateTranscriptFileAfterCompaction(params: {
  sessionFile: string;
  now?: () => Date;
}): Promise<CompactionTranscriptRotation> {
  const sessionFile = params.sessionFile?.trim();
  if (!sessionFile) {
    return { rotated: false, reason: "missing session file" };
  }
  return { rotated: false, reason: "rotation not available" };
}
