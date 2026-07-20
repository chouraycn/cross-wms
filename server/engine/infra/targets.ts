// 移植自 openclaw/src/infra/targets.ts
// 降级：outbound channel plugin 依赖简化

export type OutboundChannel = {
  provider: string;
  accountId?: string;
  channelId?: string;
  [key: string]: unknown;
};

export type HeartbeatTarget = {
  channel: string;
  target: string;
  threadId?: string;
  [key: string]: unknown;
};

export type OutboundTarget = {
  channel: string;
  to: string;
  threadId?: string;
  accountId?: string;
  [key: string]: unknown;
};

export type HeartbeatSenderContext = {
  agentId?: string;
  sessionKey?: string;
  channels?: OutboundChannel[];
  [key: string]: unknown;
};

export type OutboundTargetResolution = {
  target: OutboundTarget | null;
  mode: "resolved" | "fallback";
  reason: string;
};

export type SessionDeliveryTarget = {
  channel: string;
  to: string;
  threadId?: string;
  accountId?: string;
  sessionKey?: string;
};

/** Resolves an outbound target. Simplified without channel plugin registry. */
export function resolveOutboundTarget(params: {
  channel: string;
  to?: string;
  threadId?: string;
  accountId?: string;
}): OutboundTargetResolution {
  if (!params.channel?.trim()) {
    return { target: null, mode: "fallback", reason: "missing-channel" };
  }
  if (!params.to?.trim()) {
    return { target: null, mode: "fallback", reason: "missing-target" };
  }
  return {
    target: { channel: params.channel.trim(), to: params.to.trim(), threadId: params.threadId?.trim(), accountId: params.accountId?.trim() },
    mode: "resolved",
    reason: "explicit",
  };
}

/** Resolves a heartbeat delivery target. */
export function resolveHeartbeatDeliveryTarget(params: {
  sessionKey?: string;
  channel?: string;
  target?: string;
  threadId?: string;
}): HeartbeatTarget | null {
  if (!params.channel?.trim() || !params.target?.trim()) return null;
  return { channel: params.channel.trim(), target: params.target.trim(), threadId: params.threadId?.trim() };
}

/** Resolves a heartbeat delivery target with session route. */
export function resolveHeartbeatDeliveryTargetWithSessionRoute(params: {
  sessionKey?: string;
  channel?: string;
  target?: string;
  threadId?: string;
  sessionRoute?: unknown;
}): HeartbeatTarget | null {
  return resolveHeartbeatDeliveryTarget(params);
}

/** Resolves a heartbeat sender context. */
export function resolveHeartbeatSenderContext(params: {
  agentId?: string;
  sessionKey?: string;
  cfg?: unknown;
}): HeartbeatSenderContext {
  return { agentId: params.agentId, sessionKey: params.sessionKey };
}

/** Resolves a session delivery target. */
export function resolveSessionDeliveryTarget(params: {
  sessionKey?: string;
  channel?: string;
  to?: string;
  threadId?: string;
  accountId?: string;
}): SessionDeliveryTarget | null {
  if (!params.channel?.trim() || !params.to?.trim()) return null;
  return {
    channel: params.channel.trim(),
    to: params.to.trim(),
    threadId: params.threadId?.trim(),
    accountId: params.accountId?.trim(),
    sessionKey: params.sessionKey?.trim(),
  };
}
