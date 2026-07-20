/**
 * 移植自 openclaw/src/agents/subagent-yield-output.ts
 *
 * Subagent sessions_yield output helpers.
 * In cross-wms the sessions yield infrastructure is not available,
 * so assistantCallsSessionsYield returns false and
 * isSessionsYieldToolResult returns false.
 */

/** Check if the assistant calls sessions_yield (always false in cross-wms). */
export function assistantCallsSessionsYield(..._args: unknown[]): false {
  return false;
}

/** Check if a tool result is a sessions_yield result (always false in cross-wms). */
export function isSessionsYieldToolResult(..._args: unknown[]): false {
  return false;
}
