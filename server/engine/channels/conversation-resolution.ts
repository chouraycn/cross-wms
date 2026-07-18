import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";

export interface ConversationInfo {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  type: "direct" | "group" | "channel" | "thread";
  title?: string;
  participants: string[];
  createdAt: number;
  lastActivityAt: number;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface ConversationResolutionResult {
  resolved: boolean;
  conversation?: ConversationInfo;
  reason?: string;
}

const conversations = new Map<string, ConversationInfo>();
const externalIdMap = new Map<string, string>();

export function resolveConversation(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
  externalId?: string;
  type?: ConversationInfo["type"];
  participants?: string[];
  title?: string;
  metadata?: Record<string, unknown>;
}): ConversationResolutionResult {
  if (params.conversationId) {
    const existing = conversations.get(params.conversationId);
    if (existing) {
      return { resolved: true, conversation: existing };
    }
  }

  if (params.externalId) {
    const key = `${params.channelId}:${params.externalId}`;
    const mappedId = externalIdMap.get(key);
    if (mappedId) {
      const existing = conversations.get(mappedId);
      if (existing) {
        return { resolved: true, conversation: existing };
      }
    }
  }

  const conversation = createConversation({
    channelId: params.channelId,
    accountId: params.accountId,
    type: params.type ?? "direct",
    participants: params.participants,
    title: params.title,
    metadata: params.metadata,
  });

  if (params.externalId) {
    const key = `${params.channelId}:${params.externalId}`;
    externalIdMap.set(key, conversation.id);
  }

  return { resolved: true, conversation, reason: "created" };
}

export function createConversation(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  type: ConversationInfo["type"];
  participants?: string[];
  title?: string;
  metadata?: Record<string, unknown>;
}): ConversationInfo {
  const now = Date.now();
  const id = `conv-${params.channelId}-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const conversation: ConversationInfo = {
    id,
    channelId: params.channelId,
    accountId: params.accountId,
    type: params.type,
    title: params.title,
    participants: params.participants ?? [],
    createdAt: now,
    lastActivityAt: now,
    messageCount: 0,
    metadata: params.metadata ?? {},
  };

  conversations.set(id, conversation);
  logger.debug(`[Channels:ConversationResolution] Created conversation ${id}`);
  return conversation;
}

export function getConversation(conversationId: string): ConversationInfo | undefined {
  return conversations.get(conversationId);
}

export function updateConversation(
  conversationId: string,
  updates: Partial<ConversationInfo>
): boolean {
  const conv = conversations.get(conversationId);
  if (!conv) return false;

  Object.assign(conv, updates);
  conv.lastActivityAt = Date.now();
  return true;
}

export function incrementMessageCount(conversationId: string): number {
  const conv = conversations.get(conversationId);
  if (!conv) return -1;
  conv.messageCount++;
  conv.lastActivityAt = Date.now();
  return conv.messageCount;
}

export function addParticipant(conversationId: string, participantId: string): boolean {
  const conv = conversations.get(conversationId);
  if (!conv) return false;
  if (!conv.participants.includes(participantId)) {
    conv.participants.push(participantId);
  }
  conv.lastActivityAt = Date.now();
  return true;
}

export function removeParticipant(conversationId: string, participantId: string): boolean {
  const conv = conversations.get(conversationId);
  if (!conv) return false;
  const idx = conv.participants.indexOf(participantId);
  if (idx >= 0) {
    conv.participants.splice(idx, 1);
  }
  conv.lastActivityAt = Date.now();
  return true;
}

export function listConversations(channelId?: ChannelId): ConversationInfo[] {
  let result = Array.from(conversations.values());
  if (channelId) {
    result = result.filter((c) => c.channelId === channelId);
  }
  return result.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export function deleteConversation(conversationId: string): boolean {
  const conv = conversations.get(conversationId);
  if (!conv) return false;

  for (const [key, value] of externalIdMap) {
    if (value === conversationId) {
      externalIdMap.delete(key);
    }
  }

  conversations.delete(conversationId);
  return true;
}

export function clearConversations(): void {
  conversations.clear();
  externalIdMap.clear();
}

export function getConversationStats(): {
  total: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byChannel: Record<string, number> = {};

  for (const conv of conversations.values()) {
    byType[conv.type] = (byType[conv.type] ?? 0) + 1;
    byChannel[conv.channelId] = (byChannel[conv.channelId] ?? 0) + 1;
  }

  return {
    total: conversations.size,
    byType,
    byChannel,
  };
}
