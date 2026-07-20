/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/context-engine-capabilities.ts
 *
 * Context engine capabilities resolution.
 * In cross-wms the context engine infrastructure is not available,
 * so resolveContextEngineCapabilities returns an empty capability set.
 */

/** Resolve context engine capabilities (returns empty in cross-wms). */
export function resolveContextEngineCapabilities(..._args: unknown[]): {
  supported: false;
  reason: string;
} {
  return {
    supported: false,
    reason: "Context engine not available in cross-wms",
  };
}
