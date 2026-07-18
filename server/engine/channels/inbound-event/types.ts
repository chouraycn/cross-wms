import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { MessageSender, MessageAttachment } from "../message/types.js";

export type InboundEventType =
  | "message"
  | "message_edit"
  | "message_delete"
  | "reaction_add"
  | "reaction_remove"
  | "member_join"
  | "member_leave"
  | "channel_create"
  | "channel_delete"
  | "thread_create"
  | "thread_delete"
  | "mention"
  | "command"
  | "file_upload"
  | "voice_start"
  | "voice_end"
  | "system"
  | "unknown";

export type InboundEventSource = "webhook" | "websocket" | "poll" | "api" | "unknown";

export interface InboundEventMedia {
  type: "image" | "video" | "audio" | "file";
  url?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  filename?: string;
  metadata?: Record<string, unknown>;
}

export interface InboundEventClassification {
  isCommand: boolean;
  isMention: boolean;
  isDM: boolean;
  isThread: boolean;
  isMedia: boolean;
  commandName?: string;
  priority: "high" | "normal" | "low";
  tags: string[];
}

export interface InboundEventContext {
  eventId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  type: InboundEventType;
  source: InboundEventSource;
  timestamp: number;
  updatedAt: number;
  raw: unknown;
  sender?: MessageSender;
  conversationId?: string;
  threadId?: string;
  messageId?: string;
  content?: string;
  media?: InboundEventMedia[];
  attachments?: MessageAttachment[];
  mentions?: string[];
  classification?: InboundEventClassification;
  metadata: Record<string, unknown>;
}
