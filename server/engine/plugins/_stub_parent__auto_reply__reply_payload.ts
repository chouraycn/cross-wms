// === PENDING MIGRATION STUB ===
// Source: openclaw/src/auto-reply/reply-payload.ts (待迁移)
// Status: 结构化类型占位 stub — 类型为 { role: string; content: string } / identity 函数实现
// Used by: server/engine/plugins/{hook-types,conversation-binding.types,conversation-binding,hooks}.ts
// 注：openclaw ReplyPayload 是大型联合类型；copyReplyPayloadMetadata 复制 reply 元数据

export interface ReplyPayload {
  role?: string;
  content?: string;
  interactive?: { [key: string]: unknown };
  text?: string;
  trustedLocalMedia?: boolean;
  mediaUrl?: string;
  mediaUrls?: string[];
}

export const copyReplyPayloadMetadata = (previous: ReplyPayload, next: ReplyPayload): ReplyPayload => next;
