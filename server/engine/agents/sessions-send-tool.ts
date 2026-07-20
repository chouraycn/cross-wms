/**
 * 移植自 openclaw/src/agents/tools/sessions-send-tool.ts
 *
 * sessions_send built-in tool.
 * In cross-wms the full gateway/session infrastructure is not available,
 * so createSessionsSendTool returns a minimal tool stub.
 */

export function createSessionsSendTool(_opts?: {
  agentSessionKey?: string;
  agentChannel?: unknown;
  sandboxed?: boolean;
  config?: unknown;
  callGateway?: unknown;
}): unknown {
  return {
    label: "Session Send",
    name: "sessions_send",
    description: "Send messages to visible sessions (stub - not fully implemented in cross-wms).",
    parameters: {
      type: "object",
      properties: {
        sessionKey: { type: "string" },
        message: { type: "string" },
      },
    },
    execute: async () => ({
      type: "text" as const,
      text: JSON.stringify({ status: "error", error: "sessions_send not available in cross-wms" }),
    }),
  };
}
