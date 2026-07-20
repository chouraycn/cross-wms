/**
 * Ported from openclaw/src/agents/sender-tool-policy.ts
 *
 * Sender tool policy resolution.
 * Cross-wms degradation: returns permissive default policy.
 */

/** Resolves the sender tool policy. */
export function resolveSenderToolPolicy(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have sender-based tool policy resolution.
  return { mode: "permissive" };
}
