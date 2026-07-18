/**
 * 会话标签解析器 — 移植自 openclaw/src/channels/conversation-label.ts
 *
 * 降级策略：
 *  - 依赖 @openclaw/normalization-core/string-coerce → 已在 ../infra/string-coerce.ts 中实现
 *  - 依赖 ../auto-reply/templating.js 的 MsgContext 类型 → 未移植，定义为最小本地 stub
 *  - 依赖 ./chat-type.js 的 normalizeChatType → cross-wms 已有实现
 *
 * Builds readable labels from inbound context while preserving useful id disambiguators.
 */
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../infra/string-coerce.js";
import { normalizeChatType } from "./chat-type.js";

// ============================================================================
// ../auto-reply/templating.js —— MsgContext
// ============================================================================
//
// 降级原因：cross-wms 的 auto-reply 模块尚未移植。
// 这里按 openclaw 源定义复制 resolveConversationLabel 所需的最小字段集。
// 调用方传入的完整 MsgContext 对象可以通过结构子集化赋值给此类型。

/**
 * 入站消息上下文（降级占位）。
 *
 * openclaw 中 MsgContext 包含 Body/From/ChatType/ConversationLabel 等大量字段，
 * 这里仅保留 resolveConversationLabel 访问的字段子集，调用方传入的完整对象
 * 可通过结构子集化赋值给此类型。
 */
export type MsgContext = {
  ConversationLabel?: string;
  ThreadLabel?: string;
  ChatType?: string;
  SenderName?: string;
  From?: string;
  GroupChannel?: string;
  GroupSubject?: string;
  GroupSpace?: string;
};

function extractConversationId(from?: string): string | undefined {
  const trimmed = normalizeOptionalString(from);
  if (!trimmed) {
    return undefined;
  }
  const parts = trimmed.split(":").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

// Numeric ids and address-like ids are useful disambiguators. Human labels, hashtags,
// and handles are already readable enough and should not get redundant "id:" suffixes.
function shouldAppendId(id: string): boolean {
  if (/^[0-9]+$/.test(id)) {
    return true;
  }
  if (/^[^\s:@]+@[^\s:@]+$/.test(id)) {
    return true;
  }
  return false;
}

/**
 * Resolves the most readable conversation label from normalized inbound message context.
 */
export function resolveConversationLabel(ctx: MsgContext): string | undefined {
  const explicit = normalizeOptionalString(ctx.ConversationLabel);
  if (explicit) {
    return explicit;
  }

  const threadLabel = normalizeOptionalString(ctx.ThreadLabel);
  if (threadLabel) {
    return threadLabel;
  }

  const chatType = normalizeChatType(ctx.ChatType);
  if (chatType === "direct") {
    return normalizeOptionalString(ctx.SenderName) ?? normalizeOptionalString(ctx.From);
  }

  const base =
    normalizeOptionalString(ctx.GroupChannel) ||
    normalizeOptionalString(ctx.GroupSubject) ||
    normalizeOptionalString(ctx.GroupSpace) ||
    normalizeOptionalString(ctx.From) ||
    "";
  if (!base) {
    return undefined;
  }

  const id = extractConversationId(ctx.From);
  if (!id) {
    return base;
  }
  if (!shouldAppendId(id)) {
    return base;
  }
  if (base === id) {
    return base;
  }
  if (base.includes(id)) {
    return base;
  }
  if (normalizeLowercaseStringOrEmpty(base).includes(" id:")) {
    return base;
  }
  if (base.startsWith("#") || base.startsWith("@")) {
    return base;
  }
  return `${base} id:${id}`;
}
