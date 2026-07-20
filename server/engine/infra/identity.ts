// 移植自 openclaw/src/infra/identity.ts
// 降级：agent-scope / config 依赖简化

export type OutboundIdentity = {
  botName?: string;
  botId?: string;
  e164?: string;
  agentId?: string;
};

/** Normalizes identity fields into a consistent shape. */
export function normalizeOutboundIdentity(identity: Partial<OutboundIdentity>): OutboundIdentity {
  return {
    botName: identity.botName?.trim() || undefined,
    botId: identity.botId?.trim() || undefined,
    e164: identity.e164?.trim() || undefined,
    agentId: identity.agentId?.trim() || undefined,
  };
}

/** Resolves the outbound identity for an agent session. */
export function resolveAgentOutboundIdentity(params: {
  agentId?: string;
  cfg?: unknown;
}): OutboundIdentity {
  return {
    agentId: params.agentId?.trim() || undefined,
  };
}
