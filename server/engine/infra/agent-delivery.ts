// 移植自 openclaw/src/infra/agent-delivery.ts
// 降级：session routing / channel plugin 依赖简化

export type AgentDeliveryPlan = {
  targets: Array<{
    channel: string;
    to: string;
    threadId?: string;
    accountId?: string;
  }>;
  mode: "direct" | "session-routed" | "fallback";
  reason: string;
};

/** Resolves the delivery plan for an agent's outbound message. */
export function resolveAgentDeliveryPlan(params: {
  agentId?: string;
  sessionKey?: string;
  channel?: string;
  to?: string;
  threadId?: string;
  accountId?: string;
}): AgentDeliveryPlan {
  if (!params.channel?.trim()) {
    return { targets: [], mode: "fallback", reason: "missing-channel" };
  }
  return {
    targets: [{
      channel: params.channel.trim(),
      to: params.to?.trim() ?? "",
      threadId: params.threadId?.trim(),
      accountId: params.accountId?.trim(),
    }],
    mode: "direct",
    reason: "explicit-target",
  };
}

/** Resolves the delivery plan with session routing. */
export function resolveAgentDeliveryPlanWithSessionRoute(params: {
  agentId?: string;
  sessionKey?: string;
  channel?: string;
  to?: string;
  threadId?: string;
  accountId?: string;
  sessionRoute?: unknown;
}): AgentDeliveryPlan {
  return resolveAgentDeliveryPlan(params);
}

/** Resolves the outbound target for an agent. */
export function resolveAgentOutboundTarget(params: {
  agentId?: string;
  sessionKey?: string;
  channel?: string;
  to?: string;
  threadId?: string;
  accountId?: string;
}): { channel: string; to: string; threadId?: string; accountId?: string } | null {
  if (!params.channel?.trim() || !params.to?.trim()) return null;
  return {
    channel: params.channel.trim(),
    to: params.to.trim(),
    threadId: params.threadId?.trim(),
    accountId: params.accountId?.trim(),
  };
}
