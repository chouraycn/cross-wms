/**
 * 移植自 openclaw/src/agents/subagent-registry.store.sqlite.ts
 *
 * Persists subagent run records in the shared sqlite state database.
 * In cross-wms the sqlite/kysely infrastructure is not available,
 * so both functions degrade to returning empty results.
 */

/** Loads subagent runs from sqlite (returns empty map in cross-wms). */
export function loadSubagentRegistryFromSqlite(): Map<string, unknown> {
  return new Map();
}

/** Saves the complete subagent run snapshot to sqlite (no-op in cross-wms). */
export function saveSubagentRegistryToSqlite(_runs: Map<string, unknown>): void {
  // No-op: sqlite persistence not available in cross-wms.
}
