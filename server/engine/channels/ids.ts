import type { ChannelId } from "../../channels/types.js";

export type IdType =
  | "message"
  | "conversation"
  | "session"
  | "thread"
  | "event"
  | "turn"
  | "delivery"
  | "pairing"
  | "wizard"
  | "stream";

let idCounter = 0;

function getNextCounter(): number {
  idCounter = (idCounter + 1) % 1000000;
  return idCounter;
}

export function generateId(type: IdType, prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  const counter = getNextCounter().toString(36).padStart(4, "0");
  const base = prefix ? `${prefix}_` : "";
  return `${base}${type}_${timestamp}_${counter}_${random}`;
}

export function generateMessageId(channelId?: ChannelId): string {
  return generateId("message", channelId);
}

export function generateConversationId(channelId?: ChannelId): string {
  return generateId("conversation", channelId);
}

export function generateSessionId(channelId?: ChannelId): string {
  return generateId("session", channelId);
}

export function generateThreadId(channelId?: ChannelId): string {
  return generateId("thread", channelId);
}

export function generateEventId(channelId?: ChannelId): string {
  return generateId("event", channelId);
}

export function generateTurnId(channelId?: ChannelId): string {
  return generateId("turn", channelId);
}

export function generateDeliveryId(channelId?: ChannelId): string {
  return generateId("delivery", channelId);
}

export function generatePairingId(channelId?: ChannelId): string {
  return generateId("pairing", channelId);
}

export function generateWizardId(channelId?: ChannelId): string {
  return generateId("wizard", channelId);
}

export function generateStreamId(channelId?: ChannelId): string {
  return generateId("stream", channelId);
}

export function getIdTimestamp(id: string): number | null {
  const match = id.match(/_(\d{13})_/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export function getIdType(id: string): IdType | null {
  const match = id.match(/^([a-z]+)_/);
  if (!match) return null;
  const type = match[1] as IdType;
  const validTypes: IdType[] = [
    "message",
    "conversation",
    "session",
    "thread",
    "event",
    "turn",
    "delivery",
    "pairing",
    "wizard",
    "stream",
  ];
  return validTypes.includes(type) ? type : null;
}

export function isValidId(id: string, type?: IdType): boolean {
  if (type) {
    const idType = getIdType(id);
    if (idType !== type) return false;
  }
  return getIdTimestamp(id) !== null;
}

/**
 * Normalizes a raw chat channel id or alias to a known canonical channel id.
 * Stub implementation: lowercases the input and returns it (or null when empty).
 */
export function normalizeChatChannelId(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized || null;
}
