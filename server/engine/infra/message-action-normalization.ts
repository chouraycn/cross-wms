// 移植自 openclaw/src/infra/outbound/message-action-normalization.ts
// 降级：channel plugin / message-channel 依赖简化

import { normalizeOptionalString } from "./string-coerce.js";
import { applyTargetToParams } from "./channel-target.js";

const TARGET_ACTIONS = new Set(["send", "sendMedia"]);

/** Normalizes message-action args before target validation and dispatch. */
export function normalizeMessageActionInput(params: {
  action: string;
  args: Record<string, unknown>;
  toolContext?: {
    currentChannelProvider?: string;
    currentChannelId?: string;
    currentMessagingTarget?: string;
  };
}): Record<string, unknown> {
  const normalizedArgs = { ...params.args };
  const { action, toolContext } = params;
  const explicitChannel = normalizeOptionalString(normalizedArgs.channel) ?? "";
  const inferredChannel = explicitChannel || (toolContext?.currentChannelProvider?.trim() || "");

  const explicitTarget = normalizeOptionalString(normalizedArgs.target) ?? "";
  const hasLegacyTo = Boolean(normalizeOptionalString(normalizedArgs.to));
  const hasLegacyChannelId = Boolean(normalizeOptionalString(normalizedArgs.channelId));
  const hasLegacyTarget = hasLegacyTo || hasLegacyChannelId;

  if (explicitTarget && hasLegacyTarget) {
    delete normalizedArgs.to;
    delete normalizedArgs.channelId;
  }

  if (!explicitTarget && !hasLegacyTarget && TARGET_ACTIONS.has(action)) {
    const inferredTarget =
      normalizeOptionalString(toolContext?.currentChannelId) ??
      normalizeOptionalString(toolContext?.currentMessagingTarget);
    if (inferredTarget) {
      normalizedArgs.target = inferredTarget;
    }
  }

  if (!explicitTarget && TARGET_ACTIONS.has(action) && hasLegacyTarget) {
    const legacyTo = normalizeOptionalString(normalizedArgs.to) ?? "";
    const legacyChannelId = normalizeOptionalString(normalizedArgs.channelId) ?? "";
    const legacyTarget = legacyTo || legacyChannelId;
    if (legacyTarget) {
      normalizedArgs.target = legacyTarget;
      delete normalizedArgs.to;
      delete normalizedArgs.channelId;
    }
  }

  if (!explicitChannel && inferredChannel) {
    normalizedArgs.channel = inferredChannel;
  }

  try {
    applyTargetToParams({ action, args: normalizedArgs });
  } catch {
    // Target mapping failure is non-fatal for normalization
  }

  return normalizedArgs;
}
