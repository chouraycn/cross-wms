import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";

export interface ThreadBinding {
  threadId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  externalThreadId?: string;
  parentMessageId?: string;
  conversationId?: string;
  boundAt: number;
  metadata: Record<string, unknown>;
}

const threadBindings = new Map<string, ThreadBinding>();
const conversationToThread = new Map<string, string>();
const externalToInternal = new Map<string, string>();

export function bindThread(params: {
  threadId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  externalThreadId?: string;
  parentMessageId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}): ThreadBinding {
  const binding: ThreadBinding = {
    threadId: params.threadId,
    channelId: params.channelId,
    accountId: params.accountId,
    externalThreadId: params.externalThreadId,
    parentMessageId: params.parentMessageId,
    conversationId: params.conversationId,
    boundAt: Date.now(),
    metadata: params.metadata ?? {},
  };

  threadBindings.set(params.threadId, binding);

  if (params.conversationId) {
    conversationToThread.set(params.conversationId, params.threadId);
  }

  if (params.externalThreadId) {
    const key = `${params.channelId}:${params.externalThreadId}`;
    externalToInternal.set(key, params.threadId);
  }

  logger.debug(`[Channels:ThreadBindings] Bound thread ${params.threadId}`);
  return binding;
}

export function unbindThread(threadId: string): boolean {
  const binding = threadBindings.get(threadId);
  if (!binding) return false;

  threadBindings.delete(threadId);

  if (binding.conversationId) {
    conversationToThread.delete(binding.conversationId);
  }

  if (binding.externalThreadId) {
    const key = `${binding.channelId}:${binding.externalThreadId}`;
    externalToInternal.delete(key);
  }

  logger.debug(`[Channels:ThreadBindings] Unbound thread ${threadId}`);
  return true;
}

export function getThreadBinding(threadId: string): ThreadBinding | undefined {
  return threadBindings.get(threadId);
}

export function findThreadByConversation(conversationId: string): ThreadBinding | undefined {
  const threadId = conversationToThread.get(conversationId);
  if (!threadId) return undefined;
  return threadBindings.get(threadId);
}

export function findThreadByExternalId(
  channelId: ChannelId,
  externalThreadId: string
): ThreadBinding | undefined {
  const key = `${channelId}:${externalThreadId}`;
  const threadId = externalToInternal.get(key);
  if (!threadId) return undefined;
  return threadBindings.get(threadId);
}

export function getOrCreateThreadBinding(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId?: string;
  externalThreadId?: string;
  parentMessageId?: string;
}): ThreadBinding {
  if (params.conversationId) {
    const existing = findThreadByConversation(params.conversationId);
    if (existing) return existing;
  }

  if (params.externalThreadId) {
    const existing = findThreadByExternalId(params.channelId, params.externalThreadId);
    if (existing) return existing;
  }

  const threadId = `thread-${params.channelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return bindThread({
    threadId,
    channelId: params.channelId,
    accountId: params.accountId,
    conversationId: params.conversationId,
    externalThreadId: params.externalThreadId,
    parentMessageId: params.parentMessageId,
  });
}

export function updateThreadBinding(
  threadId: string,
  updates: Partial<ThreadBinding>
): boolean {
  const binding = threadBindings.get(threadId);
  if (!binding) return false;

  if (updates.conversationId && binding.conversationId !== updates.conversationId) {
    if (binding.conversationId) {
      conversationToThread.delete(binding.conversationId);
    }
    if (updates.conversationId) {
      conversationToThread.set(updates.conversationId, threadId);
    }
  }

  Object.assign(binding, updates);
  return true;
}

export function listThreadBindings(channelId?: ChannelId): ThreadBinding[] {
  let bindings = Array.from(threadBindings.values());
  if (channelId) {
    bindings = bindings.filter((b) => b.channelId === channelId);
  }
  return bindings;
}

export function clearThreadBindings(): void {
  threadBindings.clear();
  conversationToThread.clear();
  externalToInternal.clear();
}
