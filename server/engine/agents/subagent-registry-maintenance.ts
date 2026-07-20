/**
 * Ported from openclaw/src/agents/subagent-registry-maintenance.ts
 *
 * Session-store maintenance protection for subagent runs.
 * Cross-wms degradation: no in-memory subagent registry, returns empty.
 */

/** Lists child session keys protected from session-store maintenance pruning. */
export function listSessionMaintenanceProtectedSubagentSessionKeys(): string[] {
  // Cross-wms does not maintain the subagent runs registry in memory.
  return [];
}
