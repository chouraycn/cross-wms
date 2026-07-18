import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelMessage, MessageEnvelope } from "./types.js";
import { validateChannelMessage } from "./contracts.js";
import { advanceMessagePhase, trackMessageLifecycle } from "./lifecycle.js";

export interface MessageReceiveOptions {
  validate?: boolean;
  deduplicate?: boolean;
  timeoutMs?: number;
}

const receivedMessages = new Set<string>();

export async function receiveMessage(
  envelope: MessageEnvelope,
  options: MessageReceiveOptions = {}
): Promise<ChannelMessage | null> {
  const { validate = true, deduplicate = true } = options;

  logger.debug(`[Message:Receive] Receiving message ${envelope.messageId} from ${envelope.channelId}`);

  if (deduplicate && receivedMessages.has(envelope.messageId)) {
    logger.debug(`[Message:Receive] Duplicate message skipped: ${envelope.messageId}`);
    return null;
  }

  const message = convertEnvelopeToMessage(envelope);

  if (validate) {
    const validation = validateChannelMessage(message);
    if (!validation.success) {
      logger.error(`[Message:Receive] Validation failed for ${envelope.messageId}`, {
        errors: validation.error.issues,
      });
      return null;
    }
  }

  if (deduplicate) {
    receivedMessages.add(envelope.messageId);
  }

  trackMessageLifecycle(message);
  advanceMessagePhase(message.id, "received");
  advanceMessagePhase(message.id, "validated");

  return message;
}

export function convertEnvelopeToMessage(envelope: MessageEnvelope): ChannelMessage {
  const payload = envelope.payload as Record<string, unknown>;
  return {
    id: envelope.messageId,
    channelId: envelope.channelId,
    accountId: envelope.accountId,
    direction: "inbound",
    status: "pending",
    kind: (payload.kind as ChannelMessage["kind"]) ?? "text",
    content: (payload.content as string) ?? "",
    parts: payload.parts as ChannelMessage["parts"],
    sender: payload.sender as ChannelMessage["sender"],
    conversationId: payload.conversationId as string | undefined,
    threadId: payload.threadId as string | undefined,
    parentMessageId: payload.parentMessageId as string | undefined,
    attachments: payload.attachments as ChannelMessage["attachments"],
    mentions: payload.mentions as string[] | undefined,
    replyTo: payload.replyTo as string | undefined,
    timestamp: envelope.timestamp,
    metadata: {
      ...envelope.metadata,
      ...(payload.metadata as Record<string, unknown> | undefined),
    },
  };
}

export function createInboundMessage(params: {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  content: string;
  sender?: ChannelMessage["sender"];
  metadata?: Record<string, unknown>;
}): ChannelMessage {
  return {
    id: params.id,
    channelId: params.channelId,
    accountId: params.accountId,
    direction: "inbound",
    status: "pending",
    kind: "text",
    content: params.content,
    sender: params.sender,
    timestamp: Date.now(),
    metadata: params.metadata,
  };
}

export function clearReceivedMessageCache(messageId?: string): void {
  if (messageId) {
    receivedMessages.delete(messageId);
  } else {
    receivedMessages.clear();
  }
}

export function hasReceivedMessage(messageId: string): boolean {
  return receivedMessages.has(messageId);
}
