/**
 * Embedded agent compaction event handlers.
 * Ported from openclaw/src/agents/embedded-agent-subscribe.handlers.compaction.ts
 *
 * Note: Full embedded agent infrastructure not available in cross-wms.
 */

type CompactionEvent = {
  type: "compaction_start" | "compaction_end" | "compaction_error";
  sessionId?: string;
  entriesRemoved?: number;
  entriesKept?: number;
  error?: string;
  timestamp: Date;
};

type CompactionHandler = {
  onCompactionStart?: (event: CompactionEvent) => void;
  onCompactionEnd?: (event: CompactionEvent) => void;
  onCompactionError?: (event: CompactionEvent) => void;
};

/** Create a compaction event handler that forwards events to callbacks. */
export function createCompactionHandler(callbacks?: {
  onCompactionStart?: (event: CompactionEvent) => void;
  onCompactionEnd?: (event: CompactionEvent) => void;
  onCompactionError?: (event: CompactionEvent) => void;
}): CompactionHandler {
  return {
    onCompactionStart: callbacks?.onCompactionStart,
    onCompactionEnd: callbacks?.onCompactionEnd,
    onCompactionError: callbacks?.onCompactionError,
  };
}

/** Create a compaction handler that logs events. */
export function createLoggingCompactionHandler(
  log?: (message: string) => void,
): CompactionHandler {
  const write = log ?? console.log;
  return {
    onCompactionStart: (event) => {
      write(`[compaction] start session=${event.sessionId ?? "unknown"}`);
    },
    onCompactionEnd: (event) => {
      write(
        `[compaction] end session=${event.sessionId ?? "unknown"} removed=${event.entriesRemoved ?? 0} kept=${event.entriesKept ?? 0}`,
      );
    },
    onCompactionError: (event) => {
      write(
        `[compaction] error session=${event.sessionId ?? "unknown"} error=${event.error ?? "unknown"}`,
      );
    },
  };
}

/** Create a no-op compaction handler. */
export function createNoOpCompactionHandler(): CompactionHandler {
  return {};
}
