// 移植自 openclaw/src/infra/session-binding-normalization.ts

import type { ConversationRef } from "./session-binding.types.js";

export type ConversationRefShape = ConversationRef;

export function normalizeConversationTargetRef(ref: unknown): ConversationRef | null {
  if (!ref || typeof ref !== "object") {
    return null;
  }
  const r = ref as Record<string, unknown>;
  if (typeof r.channel !== "string" || typeof r.accountId !== "string" || typeof r.conversationId !== "string") {
    return null;
  }
  return {
    channel: r.channel.toLowerCase(),
    accountId: r.accountId,
    conversationId: r.conversationId,
    ...(typeof r.parentConversationId === "string" ? { parentConversationId: r.parentConversationId } : {}),
  };
}

export function normalizeConversationRef(ref: {
  channel?: string;
  accountId?: string;
  conversationId?: string;
  parentConversationId?: string;
}): ConversationRef {
  return {
    channel: (ref?.channel ?? "").toLowerCase(),
    accountId: ref?.accountId ?? "",
    conversationId: ref?.conversationId ?? "",
    ...(ref?.parentConversationId ? { parentConversationId: ref.parentConversationId } : {}),
  };
}

export function buildChannelAccountKey(params: { channel: string; accountId: string }): string {
  return `${params.channel.toLowerCase()}:${params.accountId}`;
}
