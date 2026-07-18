import { logger } from "../../../logger.js";
import type { ChannelId } from "../../../channels/types.js";
import type { ChannelMessage, MessagePart } from "./types.js";

export interface MessageAdapter {
  toChannelMessage(
    rawMessage: unknown,
    channelId: ChannelId
  ): ChannelMessage;

  fromChannelMessage(message: ChannelMessage): unknown;

  transformParts?(parts: MessagePart[], channelId: ChannelId): MessagePart[];

  normalizeContent?(content: string, channelId: ChannelId): string;

  extractMetadata?(rawMessage: unknown, channelId: ChannelId): Record<string, unknown>;
}

const adapters = new Map<ChannelId, MessageAdapter>();

export function registerMessageAdapter(channelId: ChannelId, adapter: MessageAdapter): void {
  adapters.set(channelId, adapter);
  logger.debug(`[Message:Adapter] Registered adapter for ${channelId}`);
}

export function unregisterMessageAdapter(channelId: ChannelId): void {
  adapters.delete(channelId);
}

export function getMessageAdapter(channelId: ChannelId): MessageAdapter | undefined {
  return adapters.get(channelId);
}

export function adaptInboundMessage(
  rawMessage: unknown,
  channelId: ChannelId
): ChannelMessage {
  const adapter = adapters.get(channelId);

  if (adapter) {
    return adapter.toChannelMessage(rawMessage, channelId);
  }

  return defaultToChannelMessage(rawMessage, channelId);
}

export function adaptOutboundMessage(message: ChannelMessage): unknown {
  const adapter = adapters.get(message.channelId);

  if (adapter) {
    return adapter.fromChannelMessage(message);
  }

  return defaultFromChannelMessage(message);
}

function defaultToChannelMessage(raw: unknown, channelId: ChannelId): ChannelMessage {
  const data = raw as Record<string, unknown>;
  return {
    id: String(data.id ?? `${channelId}-${Date.now()}`),
    channelId,
    direction: "inbound",
    status: "pending",
    kind: (data.kind as ChannelMessage["kind"]) ?? "text",
    content: String(data.content ?? data.text ?? ""),
    timestamp: Number(data.timestamp ?? data.createdAt ?? Date.now()),
    metadata: data.metadata as Record<string, unknown> | undefined,
  };
}

function defaultFromChannelMessage(message: ChannelMessage): unknown {
  return {
    id: message.id,
    content: message.content,
    kind: message.kind,
    timestamp: message.timestamp,
    metadata: message.metadata,
  };
}

export function adaptMessageParts(
  parts: MessagePart[],
  channelId: ChannelId
): MessagePart[] {
  const adapter = adapters.get(channelId);
  if (adapter?.transformParts) {
    return adapter.transformParts(parts, channelId);
  }
  return parts;
}

export function normalizeMessageContent(
  content: string,
  channelId: ChannelId
): string {
  const adapter = adapters.get(channelId);
  if (adapter?.normalizeContent) {
    return adapter.normalizeContent(content, channelId);
  }
  return content;
}
