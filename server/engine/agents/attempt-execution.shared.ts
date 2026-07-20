/**
 * 移植自 openclaw/src/agents/command/attempt-execution.shared.ts
 *
 * Shared session persistence and prompt-body helpers for agent attempt execution paths.
 * cross-wms 简化实现：提供基本的 session 持久化和内部事件上下文处理。
 */

/** Persists one session entry — simplified in cross-wms. */
export async function persistSessionEntry(params: {
  sessionStore: Record<string, unknown>;
  sessionKey: string;
  storePath: string;
  entry: unknown;
  clearedFields?: string[];
  preserveTranscriptMarkerUpdatedAt?: boolean;
  shouldPersist?: (entry: unknown | undefined) => boolean;
}): Promise<unknown | undefined> {
  if (params.sessionStore) {
    params.sessionStore[params.sessionKey] = params.entry;
  }
  return params.entry;
}

/** Prepends hidden internal event context unless the body already carries it. */
export function prependInternalEventContext(
  body: string,
  events: unknown[] | undefined,
): string {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return body;
  }
  // Simplified: just return the body without internal event context injection
  return body;
}

/** Resolves the prompt body submitted to ACP runtimes. */
export function resolveAcpPromptBody(
  body: string,
  events: unknown[] | undefined,
): string {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return body;
  }
  return body;
}

/** Resolves the body stored in transcripts after internal event rendering. */
export function resolveInternalEventTranscriptBody(
  body: string,
  events: unknown[] | undefined,
): string {
  return body;
}
