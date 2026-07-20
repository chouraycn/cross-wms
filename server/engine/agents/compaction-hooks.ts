/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/compaction-hooks.ts
 *
 * Runs compaction hooks and post-compaction side effects for embedded sessions.
 * Simplified for cross-wms: no plugin hook runner, no memory search sync.
 */

type AgentMessage = Record<string, unknown>;

/** Emits post-compaction transcript side effects. */
export async function runPostCompactionSideEffects(_params: {
  sessionKey?: string;
  agentId?: string;
  sessionFile: string;
}): Promise<void> {
  // Simplified: no transcript events or memory index sync in cross-wms
}

/** Convert a hook runner into the compaction-specific hook shape. */
export function asCompactionHookRunner(
  _hookRunner: unknown,
): {
  hasHooks?: (hookName?: string) => boolean;
  runBeforeCompaction?: () => Promise<void> | void;
  runAfterCompaction?: () => Promise<void> | void;
} | null {
  return null;
}

/** Build before-hook metrics while tolerating providers that cannot estimate all messages. */
export function buildBeforeCompactionHookMetrics(params: {
  originalMessages: AgentMessage[];
  currentMessages: AgentMessage[];
  observedTokenCount?: number;
  estimateTokensFn: (message: AgentMessage) => number;
}) {
  const estimateTokenCountSafe = (
    messages: AgentMessage[],
    estimateTokensFn: (message: AgentMessage) => number,
  ): number | undefined => {
    try {
      let total = 0;
      for (const message of messages) {
        total += estimateTokensFn(message);
      }
      return total;
    } catch {
      return undefined;
    }
  };

  return {
    messageCountOriginal: params.originalMessages.length,
    tokenCountOriginal: estimateTokenCountSafe(params.originalMessages, params.estimateTokensFn),
    messageCountBefore: params.currentMessages.length,
    tokenCountBefore:
      params.observedTokenCount ??
      estimateTokenCountSafe(params.currentMessages, params.estimateTokensFn),
  };
}

/** Run before-compaction hooks. */
export async function runBeforeCompactionHooks(params: {
  sessionId: string;
  sessionKey?: string;
  sessionAgentId: string;
  workspaceDir: string;
  metrics: ReturnType<typeof buildBeforeCompactionHookMetrics>;
}): Promise<{ hookSessionKey: string; missingSessionKey: boolean }> {
  return {
    hookSessionKey: params.sessionKey?.trim() || params.sessionId,
    missingSessionKey: !params.sessionKey?.trim(),
  };
}

/** Estimate compacted-session token count with sanity check. */
export function estimateTokensAfterCompaction(params: {
  messagesAfter: AgentMessage[];
  observedTokenCount?: number;
  fullSessionTokensBefore: number;
  estimateTokensFn: (message: AgentMessage) => number;
}): number | undefined {
  const estimateTokenCountSafe = (
    messages: AgentMessage[],
    estimateTokensFn: (message: AgentMessage) => number,
  ): number | undefined => {
    try {
      let total = 0;
      for (const message of messages) {
        total += estimateTokensFn(message);
      }
      return total;
    } catch {
      return undefined;
    }
  };

  const tokensAfter = estimateTokenCountSafe(params.messagesAfter, params.estimateTokensFn);
  if (tokensAfter === undefined) {
    return undefined;
  }
  const sanityCheckBaseline = params.observedTokenCount ?? params.fullSessionTokensBefore;
  if (
    sanityCheckBaseline > 0 &&
    tokensAfter >
      (params.observedTokenCount !== undefined ? sanityCheckBaseline : sanityCheckBaseline * 1.1)
  ) {
    return undefined;
  }
  return tokensAfter;
}

/** Run after-compaction hooks. */
export async function runAfterCompactionHooks(_params: {
  sessionId: string;
  sessionAgentId: string;
  hookSessionKey: string;
  missingSessionKey: boolean;
  workspaceDir: string;
  messageCountAfter: number;
  tokensAfter?: number;
  compactedCount: number;
  sessionFile: string;
}): Promise<void> {
  // Simplified: no internal hooks or plugin hooks in cross-wms
}
