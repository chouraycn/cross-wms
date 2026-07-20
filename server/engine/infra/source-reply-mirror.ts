// 移植自 openclaw/src/infra/outbound/source-reply-mirror.ts
// 降级：session transcript 和 channel plugin 依赖简化

import { normalizeOptionalString, normalizeOptionalLowercaseString } from "./string-coerce.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasExplicitDeliveryFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (record.ok === false) return true;
  const status = normalizeOptionalLowercaseString(record.status);
  if (status === "failed" || status === "error") return true;
  const deliveryStatus = normalizeOptionalLowercaseString(record.deliveryStatus);
  return deliveryStatus === "failed" || deliveryStatus === "error";
}

/** Mirrors successful outbound source replies into the owning session transcript. */
export async function mirrorDeliveredSourceReplyToTranscript(params: {
  action: string;
  channel: string;
  actionParams: Record<string, unknown>;
  cfg?: unknown;
  sessionKey?: string;
  agentId?: string;
  toolContext?: {
    currentChannelProvider?: string;
    currentChannelId?: string;
    currentMessagingTarget?: string;
    currentThreadTs?: string;
  };
  idempotencyKey?: string;
  deliveredPayload?: unknown;
}): Promise<boolean> {
  if (hasExplicitDeliveryFailure(params.deliveredPayload)) return false;
  if (params.action !== "send") return false;
  if (!params.sessionKey?.trim()) return false;

  const toolContext = params.toolContext;
  if (!toolContext) return false;

  const currentChannel = normalizeOptionalLowercaseString(toolContext.currentChannelProvider);
  if (!currentChannel || currentChannel !== normalizeOptionalLowercaseString(params.channel)) {
    return false;
  }

  const currentTargets = [
    normalizeOptionalString(toolContext.currentMessagingTarget),
    normalizeOptionalString(toolContext.currentChannelId),
  ].filter((t): t is string => Boolean(t));
  if (currentTargets.length === 0) return false;

  const requestedTarget = normalizeOptionalString(params.actionParams.target) ??
    normalizeOptionalString(params.actionParams.to) ??
    normalizeOptionalString(params.actionParams.channelId);
  if (!requestedTarget) return false;

  // Simplified: check if requested target matches any current context target
  return currentTargets.some((ct) => ct === requestedTarget);
}
