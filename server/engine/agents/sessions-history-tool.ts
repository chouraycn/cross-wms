/**
 * Ported from openclaw/src/agents/tools/sessions-history-tool.ts
 *
 * Sessions history tool creation.
 * Cross-wms degradation: returns placeholder tool without session history access.
 */

/** Creates a sessions history tool. */
export function createSessionsHistoryTool(..._args: unknown[]): Record<string, unknown> {
  return {
    name: "session_history",
    description: "View session conversation history (cross-wms placeholder).",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ output: "Session history tool not available in cross-wms" }),
  };
}
