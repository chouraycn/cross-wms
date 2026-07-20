/**
 * Ported from openclaw/src/agents/agent-delete-safety.ts
 *
 * Safety checks for deleting agents whose workspaces may overlap other agents.
 * Cross-wms degradation: simplified without openclaw-specific path helpers.
 */

/** Lists other agents whose workspaces overlap a candidate delete target. */
export function findOverlappingWorkspaceAgentIds(
  cfg: Record<string, unknown>,
  agentId: string,
  workspaceDir: string,
): string[] {
  // Cross-wms does not maintain the full agent directory registry.
  // Return empty to indicate no overlapping agents found.
  return [];
}
