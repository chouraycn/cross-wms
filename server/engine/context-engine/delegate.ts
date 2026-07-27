// Context-engine delegates bridge custom engines to built-in compaction and memory prompt paths.
// 移植自 openclaw/src/context-engine/delegate.ts
// 降级策略：cross-wms 暂未移植完整 context-engine 运行时，提供最小化桩。

/**
 * Delegate a context-engine compaction request to the built-in runtime compaction path.
 * Stub: returns a no-op result until the full runtime is ported.
 */
export async function delegateCompactionToRuntime(_params: {
  sessionId?: string;
  sessionFile?: string;
  tokenBudget?: number;
  currentTokenCount?: number;
  force?: boolean;
  customInstructions?: string;
  abortSignal?: AbortSignal;
  runtimeContext?: unknown;
}): Promise<{
  ok: boolean;
  compacted: boolean;
  reason: string;
  result?: {
    summary: string;
    firstKeptEntryId?: string;
    tokensBefore?: number;
    tokensAfter?: number;
    details?: string;
    sessionId?: string;
    sessionFile?: string;
  };
}> {
  return { ok: false, compacted: false, reason: "context-engine runtime not ported" };
}

/**
 * Build a context-engine-ready systemPromptAddition from the active memory
 * plugin prompt path.
 * Stub: returns undefined until the memory prompt path is ported.
 */
export function buildMemorySystemPromptAddition(_params: {
  availableTools: Set<string>;
  citationsMode?: string;
}): string | undefined {
  return undefined;
}
