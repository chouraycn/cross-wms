// 移植自 openclaw/src/infra/outbound/internal-source-reply.ts
// 降级：session 解析和 channel 插件依赖简化

import { normalizeOptionalString, normalizeOptionalLowercaseString } from "./string-coerce.js";

/** Return whether this send resolves to the private current-run source-reply sink. */
export async function shouldUseInternalSourceReplySink(input: {
  action: string;
  sourceReplyDeliveryMode?: string;
  toolContext?: {
    currentChannelProvider?: string;
    currentChannelId?: string;
    currentMessagingTarget?: string;
    currentThreadTs?: string;
    currentMessageId?: string | number;
  };
  sessionKey?: string;
  cfg?: unknown;
}, params: Record<string, unknown>): Promise<boolean> {
  if (input.action !== "send") return false;
  if (input.sourceReplyDeliveryMode !== "message_tool_only") return false;

  const provider = normalizeOptionalLowercaseString(input.toolContext?.currentChannelProvider);
  if (!provider) return false;
  if (provider === "message") return false;

  const hasCurrentContext =
    normalizeOptionalString(input.toolContext?.currentChannelId) ||
    normalizeOptionalString(input.toolContext?.currentMessagingTarget) ||
    normalizeOptionalString(input.toolContext?.currentThreadTs);
  if (!hasCurrentContext) return false;

  if (!input.sessionKey?.trim()) return false;

  // Check if explicit route params are set
  for (const key of ["channel", "target", "to", "channelId"]) {
    if (normalizeOptionalString(params[key])) return false;
  }
  if (Array.isArray(params.targets) && params.targets.some((v: unknown) => normalizeOptionalString(v))) {
    return false;
  }

  return true;
}
