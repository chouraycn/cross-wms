/**
 * 移植自 openclaw/src/agents/tool-replay-safety.ts
 *
 * Tool replay safety checks.
 * In cross-wms the full tool mutation/replay safety infrastructure is not available,
 * so isAgentToolReplaySafe returns false, collectReplaySafeToolNames returns
 * an empty array, and isCoreToolNameReplaySafe returns false.
 */

/** Check if an agent tool is replay-safe (always false in cross-wms). */
export function isAgentToolReplaySafe(..._args: unknown[]): false {
  return false;
}

/** Collect the names of replay-safe tools (returns empty in cross-wms). */
export function collectReplaySafeToolNames(..._args: unknown[]): string[] {
  return [];
}

/** Check if a core tool name is replay-safe (always false in cross-wms). */
export function isCoreToolNameReplaySafe(..._args: unknown[]): false {
  return false;
}
