/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/payloads.ts
 *
 * Embedded run payload builder.
 * In cross-wms the full payload construction infrastructure is not available,
 * so buildEmbeddedRunPayloads returns an empty object.
 */

/** Build embedded run payloads (returns empty in cross-wms). */
export function buildEmbeddedRunPayloads(..._args: unknown[]): Record<string, unknown> {
  return {};
}
