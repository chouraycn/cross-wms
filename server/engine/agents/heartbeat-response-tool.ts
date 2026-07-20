/**
 * Ported from openclaw/src/agents/tools/heartbeat-response-tool.ts
 *
 * Heartbeat response tool for auto-reply turns.
 * Cross-wms degradation: simplified tool without typebox schema / heartbeat constants.
 */

/** Creates the one-shot heartbeat response recording tool for an auto-reply turn. */
export function createHeartbeatResponseTool(): Record<string, unknown> {
  let recorded = false;
  return {
    label: "Heartbeat",
    name: "heartbeat_respond",
    displaySummary: "Record heartbeat outcome/notify choice.",
    description:
      "Record heartbeat result. `notify=false` no visible send. `notify=true` needs concise notificationText.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string" },
        notify: { type: "boolean" },
        summary: { type: "string" },
        notificationText: { type: "string" },
        reason: { type: "string" },
        priority: { type: "string" },
        nextCheck: { type: "string" },
      },
      required: ["outcome", "notify", "summary"],
      additionalProperties: false,
    },
    execute: async (_toolCallId: string, args: Record<string, unknown>) => {
      if (!args || typeof args !== "object") {
        return { isError: true, text: "Heartbeat response arguments required" };
      }
      if (recorded) {
        return { isError: true, text: "heartbeat_respond already recorded for this turn" };
      }
      recorded = true;
      return {
        output: JSON.stringify({ status: "recorded", ...args }),
      };
    },
  };
}
