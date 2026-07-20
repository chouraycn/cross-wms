/**
 * 移植自 openclaw/src/agents/compaction-planning-worker.ts
 *
 * Runs CPU-heavy compaction planning in a worker thread when histories are large.
 * cross-wms 简化实现：直接在主线程执行，不使用 worker thread。
 */

export const compactionPlanningWorkerTesting = {
  resolveCompactionPlanningWorkerUrl: () => undefined,
  runCompactionPlanningWorker: () => Promise.reject(new Error("Worker not available in cross-wms")),
  CompactionPlanningWorkerError: class CompactionPlanningWorkerError extends Error {
    constructor(message: string, readonly code: "unavailable" | "timeout" | "failed" = "unavailable") {
      super(message);
      this.name = "CompactionPlanningWorkerError";
    }
  },
};

/** Builds summary chunks — simplified to single-chunk in cross-wms. */
export async function buildSummaryChunksWithWorker(params: {
  messages: unknown[];
  maxChunkTokens: number;
  signal?: AbortSignal;
}): Promise<unknown[][]> {
  // Simplified: return all messages as a single chunk
  return [params.messages];
}

/** Builds an oversized-message fallback plan — simplified in cross-wms. */
export async function buildOversizedFallbackPlanWithWorker(params: {
  messages: unknown[];
  contextWindow: number;
  signal?: AbortSignal;
}): Promise<{ smallMessages: unknown[]; oversizedNotes: string[] }> {
  // Simplified: treat all messages as small
  return { smallMessages: params.messages, oversizedNotes: [] };
}

/** Builds a staged summarization split plan — simplified in cross-wms. */
export async function buildStageSplitPlanWithWorker(params: {
  messages: unknown[];
  maxChunkTokens: number;
  parts?: number;
  minMessagesForSplit?: number;
  signal?: AbortSignal;
}): Promise<{ mode: "single" } | { mode: "split"; chunks: unknown[][] }> {
  // Simplified: always use single mode
  return { mode: "single" };
}

/** Builds a history-pruning plan — simplified in cross-wms. */
export async function buildHistoryPrunePlanWithWorker(params: {
  messagesToSummarize: unknown[];
  turnPrefixMessages: unknown[];
  tokensBefore: number;
  contextWindowTokens: number;
  maxHistoryShare: number;
  parts?: number;
  signal?: AbortSignal;
}): Promise<{ summarizableTokens: number; newContentTokens: number; maxHistoryTokens: number; pruned: boolean }> {
  // Simplified: no pruning
  return {
    summarizableTokens: 0,
    newContentTokens: params.tokensBefore,
    maxHistoryTokens: Math.floor(params.contextWindowTokens * params.maxHistoryShare),
    pruned: false,
  };
}

/** Computes the adaptive compaction chunk ratio — simplified in cross-wms. */
export async function computeAdaptiveChunkRatioWithWorker(params: {
  messages: unknown[];
  contextWindow: number;
  signal?: AbortSignal;
}): Promise<number> {
  // Simplified: return a default ratio
  return 0.5;
}
