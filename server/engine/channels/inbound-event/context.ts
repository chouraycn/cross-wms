import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type {
  InboundEventContext,
  InboundEventType,
  InboundEventSource,
} from "./types.js";
import { classifyInboundEvent } from "./classification.js";
import { processMediaAttachments } from "./media.js";

export interface EventCreationOptions {
  classify?: boolean;
  processMedia?: boolean;
  metadata?: Record<string, unknown>;
}

const eventStore = new Map<string, InboundEventContext>();

export function createInboundEvent(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  type: InboundEventType;
  source?: InboundEventSource;
  raw: unknown;
  sender?: InboundEventContext["sender"];
  conversationId?: string;
  threadId?: string;
  messageId?: string;
  content?: string;
  media?: InboundEventContext["media"];
  attachments?: InboundEventContext["attachments"];
  mentions?: string[];
  metadata?: Record<string, unknown>;
}): InboundEventContext {
  const eventId = `evt-${params.channelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const event: InboundEventContext = {
    eventId,
    channelId: params.channelId,
    accountId: params.accountId,
    type: params.type,
    source: params.source ?? "unknown",
    timestamp: Date.now(),
    updatedAt: Date.now(),
    raw: params.raw,
    sender: params.sender,
    conversationId: params.conversationId,
    threadId: params.threadId,
    messageId: params.messageId,
    content: params.content,
    media: params.media,
    attachments: params.attachments,
    mentions: params.mentions,
    metadata: params.metadata ?? {},
  };

  eventStore.set(eventId, event);
  logger.debug(`[InboundEvent:Context] Created event ${eventId} (${params.type})`);

  return event;
}

export async function enrichEventContext(
  event: InboundEventContext,
  options: EventCreationOptions = {}
): Promise<InboundEventContext> {
  const { classify = true, processMedia = true } = options;

  if (processMedia) {
    event.media = processMediaAttachments(event);
  }

  if (classify) {
    event.classification = classifyInboundEvent(event);
  }

  event.updatedAt = Date.now();
  return event;
}

export function getEventContext(eventId: string): InboundEventContext | undefined {
  return eventStore.get(eventId);
}

export function updateEventContext(
  eventId: string,
  updates: Partial<InboundEventContext>
): boolean {
  const event = eventStore.get(eventId);
  if (!event) return false;

  Object.assign(event, updates);
  event.updatedAt = Date.now();
  return true;
}

export function setEventMetadata(
  eventId: string,
  key: string,
  value: unknown
): boolean {
  const event = eventStore.get(eventId);
  if (!event) return false;

  event.metadata[key] = value;
  event.updatedAt = Date.now();
  return true;
}

export function getEventMetadata(eventId: string, key: string): unknown {
  return eventStore.get(eventId)?.metadata[key];
}

export function listEventsByChannel(channelId: ChannelId, limit?: number): InboundEventContext[] {
  let events = Array.from(eventStore.values()).filter((e) => e.channelId === channelId);
  events.sort((a, b) => b.timestamp - a.timestamp);
  if (limit) events = events.slice(0, limit);
  return events;
}

export function removeEvent(eventId: string): boolean {
  return eventStore.delete(eventId);
}

export function clearEvents(): void {
  eventStore.clear();
}

export function getEventStats(): {
  total: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byChannel: Record<string, number> = {};

  for (const event of eventStore.values()) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    byChannel[event.channelId] = (byChannel[event.channelId] ?? 0) + 1;
  }

  return {
    total: eventStore.size,
    byType,
    byChannel,
  };
}
