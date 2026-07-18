import { z } from "zod";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type {
  MessageDirection,
  MessageStatus,
  MessageKind,
  MessagePartKind,
  MessageLifecyclePhase,
} from "./types.js";

export const MessageDirectionSchema = z.enum(["inbound", "outbound"]) as z.ZodType<MessageDirection>;

export const MessageStatusSchema = z.enum([
  "pending",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled",
  "expired",
]) as z.ZodType<MessageStatus>;

export const MessageKindSchema = z.enum([
  "text",
  "media",
  "voice",
  "poll",
  "card",
  "system",
  "command",
  "event",
]) as z.ZodType<MessageKind>;

export const MessagePartKindSchema = z.enum([
  "text",
  "markdown",
  "image",
  "file",
  "audio",
  "video",
  "poll",
  "card",
  "button",
  "divider",
]) as z.ZodType<MessagePartKind>;

export const MessageLifecyclePhaseSchema = z.enum([
  "received",
  "validated",
  "classified",
  "queued",
  "processing",
  "responding",
  "sending",
  "sent",
  "failed",
  "acknowledged",
]) as z.ZodType<MessageLifecyclePhase>;

export const MessagePartSchema = z.object({
  kind: MessagePartKindSchema,
  content: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const MessageSenderSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  username: z.string().optional(),
  avatar: z.string().optional(),
  isBot: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const MessageAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  mimeType: z.string(),
  size: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ChannelMessageSchema = z.object({
  id: z.string(),
  channelId: z.string() as z.ZodType<ChannelId>,
  accountId: z.string().optional() as z.ZodType<AccountId | undefined>,
  direction: MessageDirectionSchema,
  status: MessageStatusSchema,
  kind: MessageKindSchema,
  content: z.string(),
  parts: z.array(MessagePartSchema).optional(),
  sender: MessageSenderSchema.optional(),
  target: z
    .object({
      type: z.enum(["direct", "channel", "thread", "group"]),
      id: z.string(),
      subId: z.string().optional(),
    })
    .optional(),
  conversationId: z.string().optional(),
  threadId: z.string().optional(),
  parentMessageId: z.string().optional(),
  attachments: z.array(MessageAttachmentSchema).optional(),
  mentions: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  timestamp: z.number(),
  editedAt: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const MessageEnvelopeSchema = z.object({
  messageId: z.string(),
  channelId: z.string() as z.ZodType<ChannelId>,
  accountId: z.string().optional() as z.ZodType<AccountId | undefined>,
  payload: z.unknown(),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const MessageLifecycleEventSchema = z.object({
  messageId: z.string(),
  phase: MessageLifecyclePhaseSchema,
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const MessageCapabilitiesSchema = z.object({
  text: z.boolean().optional(),
  markdown: z.boolean().optional(),
  attachments: z.boolean().optional(),
  reactions: z.boolean().optional(),
  threading: z.boolean().optional(),
  replies: z.boolean().optional(),
  mentions: z.boolean().optional(),
  typing: z.boolean().optional(),
  editing: z.boolean().optional(),
  deletion: z.boolean().optional(),
  readReceipts: z.boolean().optional(),
  deliveryReceipts: z.boolean().optional(),
});

export function validateChannelMessage(data: unknown) {
  return ChannelMessageSchema.safeParse(data);
}

export function validateMessagePart(data: unknown) {
  return MessagePartSchema.safeParse(data);
}

export function validateMessageLifecycleEvent(data: unknown) {
  return MessageLifecycleEventSchema.safeParse(data);
}
