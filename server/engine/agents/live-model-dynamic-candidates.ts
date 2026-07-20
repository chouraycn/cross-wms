/**
 * Ported from openclaw/src/agents/live-model-dynamic-candidates.ts
 *
 * Dynamic live model candidate resolution.
 * Cross-wms degradation: returns input unchanged without dynamic model discovery.
 */

/** Appends prioritized dynamic live models to a candidate list. */
export async function appendPrioritizedDynamicLiveModels(
  candidates: unknown[],
): Promise<unknown[]> {
  // Cross-wms does not have dynamic live model discovery.
  return candidates;
}
