/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/resource-loader.ts
 *
 * Embedded agent resource loader.
 * In cross-wms the full resource loading infrastructure is not available,
 * so createEmbeddedAgentResourceLoader returns a no-op loader and
 * the discovery options constant is empty.
 */

/** Discovery options for embedded agent resource loading (empty in cross-wms). */
export const EMBEDDED_AGENT_RESOURCE_LOADER_DISCOVERY_OPTIONS: Record<string, unknown> = {};

/** Create an embedded agent resource loader (returns no-op in cross-wms). */
export function createEmbeddedAgentResourceLoader(..._args: unknown[]): {
  load: () => Promise<unknown[]>;
} {
  return {
    load: async () => [],
  };
}
