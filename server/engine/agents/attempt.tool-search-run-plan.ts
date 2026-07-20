/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.tool-search-run-plan.ts
 *
 * Tool search run plan builder.
 * In cross-wms the tool search infrastructure is not available,
 * so buildToolSearchRunPlan returns an empty plan.
 */

/** Tool names allowed in tool search control allowlists. */
export const TOOL_SEARCH_CONTROL_ALLOWLIST_NAMES: string[] = [];

/** Build a tool search run plan (returns empty in cross-wms). */
export function buildToolSearchRunPlan(..._args: unknown[]): {
  tools: unknown[];
  allowlist: string[];
} {
  return {
    tools: [],
    allowlist: [],
  };
}
