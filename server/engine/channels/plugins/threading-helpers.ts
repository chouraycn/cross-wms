import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";

export interface ChannelThread {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  parentMessageId?: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

export interface ThreadResolutionResult {
  found: boolean;
  thread?: ChannelThread;
  reason?: string;
}

const threadStore = new Map<string, ChannelThread>();
const conversationThreadMap = new Map<string, string>();

export function createThread(params: {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  parentMessageId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}): ChannelThread {
  const now = Date.now();
  const thread: ChannelThread = {
    id: params.id,
    channelId: params.channelId,
    accountId: params.accountId,
    parentMessageId: params.parentMessageId,
    title: params.title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    metadata: params.metadata,
  };

  threadStore.set(thread.id, thread);
  logger.debug(`[Plugins:ThreadingHelpers] Created thread ${thread.id}`);
  return thread;
}

export function getThread(threadId: string): ChannelThread | undefined {
  return threadStore.get(threadId);
}

export function updateThread(threadId: string, updates: Partial<ChannelThread>): boolean {
  const thread = threadStore.get(threadId);
  if (!thread) return false;

  Object.assign(thread, updates);
  thread.updatedAt = Date.now();
  return true;
}

export function incrementThreadMessageCount(threadId: string): number {
  const thread = threadStore.get(threadId);
  if (!thread) return -1;

  thread.messageCount++;
  thread.updatedAt = Date.now();
  return thread.messageCount;
}

export function getOrCreateThread(params: {
  threadId?: string;
  channelId: ChannelId;
  accountId?: AccountId;
  parentMessageId?: string;
}): ChannelThread {
  if (params.threadId) {
    const existing = threadStore.get(params.threadId);
    if (existing) return existing;
  }

  const newId = params.threadId ?? `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return createThread({
    id: newId,
    channelId: params.channelId,
    accountId: params.accountId,
    parentMessageId: params.parentMessageId,
  });
}

export function setConversationThread(conversationId: string, threadId: string): void {
  conversationThreadMap.set(conversationId, threadId);
}

export function getConversationThread(conversationId: string): string | undefined {
  return conversationThreadMap.get(conversationId);
}

export function listThreadsByChannel(channelId: ChannelId): ChannelThread[] {
  return Array.from(threadStore.values()).filter((t) => t.channelId === channelId);
}

export function deleteThread(threadId: string): boolean {
  logger.debug(`[Plugins:ThreadingHelpers] Deleting thread ${threadId}`);
  return threadStore.delete(threadId);
}

export function clearThreads(): void {
  threadStore.clear();
  conversationThreadMap.clear();
}

export function resolveThreadFromMessage(message: {
  threadId?: string;
  parentMessageId?: string;
  channelId: ChannelId;
  accountId?: AccountId;
}): ThreadResolutionResult {
  if (message.threadId) {
    const thread = getThread(message.threadId);
    if (thread) {
      return { found: true, thread };
    }
  }

  if (message.parentMessageId) {
    const thread = Array.from(threadStore.values()).find(
      (t) => t.parentMessageId === message.parentMessageId
    );
    if (thread) {
      return { found: true, thread };
    }
  }

  return {
    found: false,
    reason: "No thread found for message",
  };
}

export function isThreadActive(threadId: string, maxIdleMs: number = 3600000): boolean {
  const thread = threadStore.get(threadId);
  if (!thread) return false;
  return Date.now() - thread.updatedAt < maxIdleMs;
}
