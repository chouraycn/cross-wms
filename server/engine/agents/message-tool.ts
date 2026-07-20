/**
 * 移植自 openclaw/src/agents/tools/message-tool.ts
 *
 * 降级实现：提供 message tool 工厂，不再抛出 stub 错误。
 */

export type AnyAgentTool = {
  label?: string;
  name: string;
  description: string;
  parameters?: unknown;
  execute?: (toolCallId: string, args: unknown, signal?: AbortSignal) => Promise<unknown>;
};

export function createMessageTool(_options?: unknown): AnyAgentTool {
  return {
    label: "Message",
    name: "message",
    description: "Send and manage messages across configured channels.",
    execute: async () => ({
      status: "unavailable",
      message: "Message tool not available in cross-wms mode.",
    }),
  };
}
