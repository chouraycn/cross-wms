import { z } from "zod";
import { logger } from "../../../logger.js";
import type { ChannelMessage } from "../../../channels/message/types.js";

export const MessageValidationSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]),
  status: z.enum(["pending", "queued", "sending", "sent", "delivered", "read", "failed", "cancelled", "expired"]),
  kind: z.enum(["text", "media", "voice", "poll", "card", "system", "command", "event"]),
  content: z.string(),
  timestamp: z.number().int().positive(),
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateChannelMessage(message: Partial<ChannelMessage>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = MessageValidationSchema.safeParse(message);

  if (!result.success) {
    errors.push(...result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }

  if (!message.content || message.content.trim().length === 0) {
    warnings.push("消息内容为空");
  }

  if (message.content && message.content.length > 10000) {
    warnings.push("消息内容过长（超过 10000 字符）");
  }

  if (!message.channelId) {
    errors.push("channelId 不能为空");
  }

  if (!message.id) {
    errors.push("id 不能为空");
  }

  logger.debug(`[ChannelMessage:Validator] Validated message ${message.id}: ${errors.length} errors, ${warnings.length} warnings`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateMessageContent(content: string): { valid: boolean; reason?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: "内容为空" };
  }

  if (content.length > 10000) {
    return { valid: false, reason: "内容过长" };
  }

  return { valid: true };
}

export function validateMessageId(messageId: string): boolean {
  if (!messageId || messageId.length < 1) return false;
  if (messageId.length > 255) return false;
  return /^[a-zA-Z0-9_-]+$/.test(messageId);
}

export function validateChannelId(channelId: string): boolean {
  if (!channelId || channelId.length < 1) return false;
  if (channelId.length > 255) return false;
  return /^[a-zA-Z0-9_-]+$/.test(channelId);
}