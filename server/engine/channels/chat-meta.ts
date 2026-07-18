/**
 * Cached built-in chat channel metadata accessors. — 移植自 openclaw/src/channels/chat-meta.ts
 *
 * 降级策略：
 *  - ./chat-meta-shared.js (buildChatChannelMetaById, ChatChannelMeta) → 本目录已移植
 *  - ./ids.js (CHAT_CHANNEL_ORDER, ChatChannelId) → ./_openclaw-stubs.js
 */
import { buildChatChannelMetaById, type ChatChannelMeta } from "./chat-meta-shared.js";
import { type ChatChannelId } from "./_openclaw-stubs.js";

let chatChannelMetaCache: Record<ChatChannelId, ChatChannelMeta> | null = null;

function getChatChannelMetaById(): Record<ChatChannelId, ChatChannelMeta> {
  chatChannelMetaCache ??= buildChatChannelMetaById();
  return chatChannelMetaCache;
}

/**
 * Lists built-in chat channel metadata in configured display order.
 */
export function listChatChannels(): ChatChannelMeta[] {
  const metaById = getChatChannelMetaById();
  // CHAT_CHANNEL_ORDER 在 stub 中为空数组；这里直接返回空列表，保持降级行为一致。
  // 注：openclaw 源使用 CHAT_CHANNEL_ORDER.map(...).filter(...)。
  // 由于 cross-wms 的 ids.ts 不导出 CHAT_CHANNEL_ORDER，这里通过 chat-meta-shared
  // 间接依赖 stub 中的常量，调用方应处理空列表情况。
  return Object.values(metaById);
}

/**
 * Returns metadata for one built-in chat channel id.
 */
export function getChatChannelMeta(id: ChatChannelId): ChatChannelMeta {
  return getChatChannelMetaById()[id];
}
