/**
 * Ported from openclaw/src/agents/agent-runtime-config.ts
 *
 * Agent runtime configuration resolver.
 * Cross-wms degradation: returns empty config without runtime resolution.
 */

/** Resolves agent runtime configuration. */
export async function resolveAgentRuntimeConfig(..._args: any[]): Promise<Record<string, any>> {
  // Cross-wms does not have full agent runtime config resolution.
  return {};
}
