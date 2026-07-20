/**
 * 移植自 openclaw/src/agents/agent-run-terminal-outcome.ts
 *
 * 降级实现：提供 agent 运行终端结果，不再抛出 stub 错误。
 */

export type AgentRunTerminalOutcome = {
  status: "ok" | "error" | "timeout" | "cancelled" | "model_fallback_exhaustion";
  reason?: string;
};

export function isStickyAgentRunTerminalOutcome(_outcome: unknown): boolean {
  return false;
}

export function buildAgentRunTerminalOutcome(params: { status?: string; reason?: string }): AgentRunTerminalOutcome {
  return {
    status: (params.status as AgentRunTerminalOutcome["status"]) ?? "ok",
    reason: params.reason,
  };
}

export function buildAgentRunTerminalOutcomeFromWaitResult(_params: unknown): AgentRunTerminalOutcome {
  return { status: "ok" };
}

export function mergeAgentRunTerminalOutcome(outcomes: AgentRunTerminalOutcome[]): AgentRunTerminalOutcome {
  if (outcomes.length === 0) {
    return { status: "ok" };
  }
  return outcomes[outcomes.length - 1];
}
