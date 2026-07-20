/**
 * 移植自 openclaw/src/agents/tools/nodes-tool.ts
 *
 * nodes built-in tool.
 * In cross-wms the full gateway/node infrastructure is not available,
 * so createNodesTool returns a minimal tool stub.
 */

export function createNodesTool(_options?: {
  agentSessionKey?: string;
  agentChannel?: unknown;
  agentAccountId?: string;
  currentChannelId?: string;
  currentThreadTs?: string | number;
  config?: unknown;
  modelHasVision?: boolean;
  allowMediaInvokeCommands?: boolean;
}): unknown {
  return {
    label: "Nodes",
    name: "nodes",
    description: "Discover/control paired nodes (stub - not fully implemented in cross-wms).",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string" },
        node: { type: "string" },
      },
    },
    execute: async () => ({
      type: "text" as const,
      text: JSON.stringify({ status: "error", error: "nodes tool not available in cross-wms" }),
    }),
  };
}
