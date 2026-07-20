/**
 * Ported from openclaw/src/agents/subagent-spawn-accepted-note.ts
 *
 * Subagent spawn accepted note constants and resolver.
 * Cross-wms degradation: returns default notes without agent config.
 */

export const SUBAGENT_SPAWN_ACCEPTED_NOTE = "Subagent session accepted.";
export const SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE = "Subagent session accepted.";

/** Resolves the accepted note for a subagent spawn. */
export function resolveSubagentSpawnAcceptedNote(params?: {
  agentId?: string;
}): string {
  return SUBAGENT_SPAWN_ACCEPTED_NOTE;
}
