/**
 * Ported from openclaw/src/agents/tools/sessions-send-tool.a2a.ts
 *
 * A2A (agent-to-agent) sessions send flow.
 * Cross-wms degradation: returns empty result without A2A protocol support.
 */

/** Runs the A2A sessions send flow. */
export function runSessionsSendA2AFlow(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have A2A protocol support.
  return {};
}

/** Testing hook for A2A sessions send tool. */
export const testing_sessions_send_tool_a2a: Record<string, unknown> = {};
