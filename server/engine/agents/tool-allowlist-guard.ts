/**
 * Ported from openclaw/src/agents/tool-allowlist-guard.ts
 *
 * Tool allowlist guard for explicit tool source collection.
 * Cross-wms degradation: returns empty sources and default error message.
 */

/** Collects explicit tool allowlist sources from config. */
export function collectExplicitToolAllowlistSources(..._args: unknown[]): string[] {
  // Cross-wms does not have agent config resolution for tool allowlists.
  return [];
}

/** Builds an error message for empty explicit tool allowlist. */
export function buildEmptyExplicitToolAllowlistError(params: {
  agentId?: string;
  allowlistSource?: string;
}): string {
  const agentPart = params.agentId ? ` for agent "${params.agentId}"` : "";
  return `No tools are explicitly allowed${agentPart}. Configure tools.allowlist or disable explicit allowlist mode.`;
}
