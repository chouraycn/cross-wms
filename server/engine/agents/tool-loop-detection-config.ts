/**
 * Ported from openclaw/src/agents/tool-loop-detection-config.ts
 *
 * Tool loop-detection config resolver.
 * Cross-wms degradation: overlays agent settings on globals with simplified types.
 */

/** Resolves effective tool loop-detection config by overlaying agent settings on globals. */
export function resolveToolLoopDetectionConfig(params: {
  cfg?: Record<string, any>;
  agentId?: string;
}): Record<string, any> | undefined {
  const tools = params.cfg?.tools as Record<string, any> | undefined;
  const global = tools?.loopDetection as Record<string, any> | undefined;
  // Cross-wms does not have resolveAgentConfig; return global config only.
  return global;
}
