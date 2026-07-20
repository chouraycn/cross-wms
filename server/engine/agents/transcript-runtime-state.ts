/**
 * Ported from openclaw/src/agents/embedded-agent-runner/transcript-runtime-state.ts
 *
 * Runtime transcript state helpers.
 * Cross-wms degradation: returns default/empty without session accessor dependencies.
 */

export type RuntimeTranscriptScope = Record<string, unknown>;

/** Resolves the runtime transcript target for read/probe operations. */
export async function resolveRuntimeTranscriptReadTarget(
  _scope: RuntimeTranscriptScope,
): Promise<Record<string, unknown>> {
  // Cross-wms does not have session transcript runtime accessor.
  return {};
}

/** Persists an append or migration rewrite for a resolved runtime transcript. */
export async function persistRuntimeTranscriptStateMutation(_params: {
  appendedEntries: unknown[];
  state: Record<string, unknown>;
  target: Record<string, unknown>;
}): Promise<void> {
  // Cross-wms does not have transcript file state persistence.
}
