// 移植自 openclaw/src/infra/outbound/session-context.ts
// 降级：agent-scope / chat-type 依赖简化

import { normalizeOptionalString } from "./string-coerce.js";

export type OutboundSessionContext = {
  key?: string;
  policyKey?: string;
  conversationType?: "group" | "direct";
  agentId?: string;
  requesterAccountId?: string;
  requesterSenderId?: string;
  requesterSenderName?: string;
  requesterSenderUsername?: string;
  requesterSenderE164?: string;
};

/** Builds the outbound delivery session context, omitting empty policy fields. */
export function buildOutboundSessionContext(params: {
  sessionKey?: string | null;
  policySessionKey?: string | null;
  conversationType?: string | null;
  isGroup?: boolean | null;
  agentId?: string | null;
  requesterAccountId?: string | null;
  requesterSenderId?: string | null;
  requesterSenderName?: string | null;
  requesterSenderUsername?: string | null;
  requesterSenderE164?: string | null;
}): OutboundSessionContext | undefined {
  const key = normalizeOptionalString(params.sessionKey);
  const policyKey = normalizeOptionalString(params.policySessionKey);
  const normalizedChatType = (params.conversationType ?? "").trim().toLowerCase();
  const conversationType: "group" | "direct" | undefined =
    normalizedChatType === "group" || normalizedChatType === "channel"
      ? "group"
      : normalizedChatType === "direct"
        ? "direct"
        : params.isGroup === true
          ? "group"
          : params.isGroup === false
            ? "direct"
            : undefined;
  const agentId = normalizeOptionalString(params.agentId);
  const requesterAccountId = normalizeOptionalString(params.requesterAccountId);
  const requesterSenderId = normalizeOptionalString(params.requesterSenderId);
  const requesterSenderName = normalizeOptionalString(params.requesterSenderName);
  const requesterSenderUsername = normalizeOptionalString(params.requesterSenderUsername);
  const requesterSenderE164 = normalizeOptionalString(params.requesterSenderE164);

  if (
    !key && !policyKey && !conversationType && !agentId &&
    !requesterAccountId && !requesterSenderId && !requesterSenderName &&
    !requesterSenderUsername && !requesterSenderE164
  ) {
    return undefined;
  }
  return {
    ...(key ? { key } : {}),
    ...(policyKey ? { policyKey } : {}),
    ...(conversationType ? { conversationType } : {}),
    ...(agentId ? { agentId } : {}),
    ...(requesterAccountId ? { requesterAccountId } : {}),
    ...(requesterSenderId ? { requesterSenderId } : {}),
    ...(requesterSenderName ? { requesterSenderName } : {}),
    ...(requesterSenderUsername ? { requesterSenderUsername } : {}),
    ...(requesterSenderE164 ? { requesterSenderE164 } : {}),
  };
}
