import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelTarget } from "../targets.js";

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus =
  | "pending"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled"
  | "expired";

export type MessageKind =
  | "text"
  | "media"
  | "voice"
  | "poll"
  | "card"
  | "system"
  | "command"
  | "event";

export type MessagePartKind =
  | "text"
  | "markdown"
  | "image"
  | "file"
  | "audio"
  | "video"
  | "poll"
  | "card"
  | "button"
  | "divider";

export interface MessagePart {
  kind: MessagePartKind;
  content: unknown;
  metadata?: Record<string, unknown>;
}

export interface MessageSender {
  id: string;
  name?: string;
  username?: string;
  avatar?: string;
  isBot?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url?: string;
  mimeType: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export interface ChannelMessage {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  direction: MessageDirection;
  status: MessageStatus;
  kind: MessageKind;
  content: string;
  parts?: MessagePart[];
  sender?: MessageSender;
  target?: ChannelTarget;
  conversationId?: string;
  threadId?: string;
  parentMessageId?: string;
  attachments?: MessageAttachment[];
  mentions?: string[];
  replyTo?: string;
  timestamp: number;
  editedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface MessageEnvelope<T = unknown> {
  messageId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  payload: T;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type MessageLifecyclePhase =
  | "received"
  | "validated"
  | "classified"
  | "queued"
  | "processing"
  | "responding"
  | "sending"
  | "sent"
  | "failed"
  | "acknowledged";

export interface MessageLifecycleEvent {
  messageId: string;
  phase: MessageLifecyclePhase;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MessageCapabilities {
  text?: boolean;
  markdown?: boolean;
  attachments?: boolean;
  reactions?: boolean;
  threading?: boolean;
  replies?: boolean;
  mentions?: boolean;
  typing?: boolean;
  editing?: boolean;
  deletion?: boolean;
  readReceipts?: boolean;
  deliveryReceipts?: boolean;
}
