/**
 * 移植自 openclaw/src/agents/command/run-context.ts
 *
 * 降级实现：提供 agent 运行上下文，不再抛出 stub 错误。
 */

export type AgentRunContext = {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  [key: string]: unknown;
};

export function resolveAgentRunContext(_params?: unknown): AgentRunContext {
  return {};
}
