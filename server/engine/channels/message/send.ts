import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelMessage, MessagePart, MessageCapabilities } from "./types.js";
import type { ChannelTarget } from "../targets.js";
import { advanceMessagePhase, trackMessageLifecycle } from "./lifecycle.js";

export interface MessageSendOptions {
  durability?: "required" | "best_effort";
  retryCount?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  channelMessageId?: string;
  error?: string;
  retryable?: boolean;
}

type SendAdapter = (message: ChannelMessage, options: MessageSendOptions) => Promise<MessageSendResult>;

const sendAdapters = new Map<ChannelId, SendAdapter>();

export function registerSendAdapter(channelId: ChannelId, adapter: SendAdapter): void {
  sendAdapters.set(channelId, adapter);
}

export function unregisterSendAdapter(channelId: ChannelId): void {
  sendAdapters.delete(channelId);
}

export async function sendMessage(
  message: ChannelMessage,
  options: MessageSendOptions = {}
): Promise<MessageSendResult> {
  const { retryCount = 0 } = options;

  logger.debug(`[Message:Send] Sending message ${message.id} to ${message.channelId}`);

  trackMessageLifecycle(message);
  advanceMessagePhase(message.id, "sending");

  const adapter = sendAdapters.get(message.channelId);

  if (!adapter) {
    const result: MessageSendResult = {
      success: false,
      error: `No send adapter registered for channel: ${message.channelId}`,
      retryable: false,
    };
    advanceMessagePhase(message.id, "failed", { error: result.error });
    return result;
  }

  try {
    const result = await adapter(message, options);

    if (result.success) {
      advanceMessagePhase(message.id, "sent", { channelMessageId: result.channelMessageId });
    } else {
      advanceMessagePhase(message.id, "failed", { error: result.error });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result: MessageSendResult = {
      success: false,
      error,
      retryable: retryCount < 3,
    };
    advanceMessagePhase(message.id, "failed", { error });
    return result;
  }
}

export function createOutboundMessage(params: {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  content: string;
  target?: ChannelTarget;
  parts?: MessagePart[];
  replyTo?: string;
  capabilities?: MessageCapabilities;
  metadata?: Record<string, unknown>;
}): ChannelMessage {
  return {
    id: params.id,
    channelId: params.channelId,
    accountId: params.accountId,
    direction: "outbound",
    status: "pending",
    kind: "text",
    content: params.content,
    parts: params.parts,
    target: params.target,
    replyTo: params.replyTo,
    timestamp: Date.now(),
    metadata: params.metadata,
  };
}

export function buildMessageParts(content: string, capabilities?: MessageCapabilities): MessagePart[] {
  const parts: MessagePart[] = [];

  if (capabilities?.markdown) {
    parts.push({ kind: "markdown", content });
  } else {
    parts.push({ kind: "text", content });
  }

  return parts;
}

export async function sendMessageWithRetry(
  message: ChannelMessage,
  options: MessageSendOptions & { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<MessageSendResult> {
  const { maxRetries = 3, retryDelayMs = 1000, ...sendOptions } = options;
  let lastResult: MessageSendResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }

    lastResult = await sendMessage(message, {
      ...sendOptions,
      retryCount: attempt,
    });

    if (lastResult.success || !lastResult.retryable) {
      return lastResult;
    }

    logger.warn(`[Message:Send] Retry ${attempt + 1}/${maxRetries} for message ${message.id}`);
  }

  return lastResult ?? { success: false, error: "Max retries exceeded", retryable: false };
}
