// Public channel registry facade for channel ids, metadata, and setup copy.
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@cdf-know/normalization-core/string-coerce";
import { normalizeChatChannelId, type ChatChannelId } from "./ids.js";
import type { ChannelId } from "./plugins/channel-id.types.js";
import type { ChannelMeta } from "./plugins/types.core.js";
import {
  findRegisteredChannelPluginEntry,
  findRegisteredChannelPluginEntryById,
  listRegisteredChannelPluginEntries,
} from "./registry-lookup.js";
export { getChatChannelMeta } from "./chat-meta.js";
// CHAT_CHANNEL_ORDER 在 cross-wms 的 ids.ts 中未导出（仅有 openclaw 的 stub 实现），
// 这里改为从 _openclaw-stubs.js 重导出，避免运行时 SyntaxError。
export { CHAT_CHANNEL_ORDER } from "./_openclaw-stubs.js";
export type { ChatChannelId } from "./ids.js";
export { normalizeChatChannelId };

/**
 * 兼容别名：utils/message-channel.ts 通过 getChannelMeta(id) 获取渠道元信息。
 * 委托给 getRegisteredChannelPluginMeta。
 */
export function getChannelMeta(id: string) {
  return getRegisteredChannelPluginMeta(id);
}

/**
 * Normalizes built-in chat channel ids without loading channel plugin implementations.
 */
export function normalizeChannelId(raw?: string | null): ChatChannelId | null {
  return normalizeChatChannelId(raw);
}

/**
 * Normalizes any registered channel plugin id or alias after registry initialization.
 */
export function normalizeAnyChannelId(raw?: string | null): ChannelId | null {
  const key = normalizeOptionalLowercaseString(raw);
  if (!key) {
    return null;
  }
  return findRegisteredChannelPluginEntry(key)?.plugin.id ?? null;
}

/**
 * Lists registered channel plugin ids without importing their runtime implementations.
 */
export function listRegisteredChannelPluginIds(): ChannelId[] {
  return listRegisteredChannelPluginEntries().flatMap((entry) => {
    const id = normalizeOptionalString(entry.plugin.id);
    return id ? [id as ChannelId] : [];
  });
}

/**
 * 兼容别名：utils/message-channel-normalize.ts 通过 listChannels() 获取已注册渠道列表。
 * 委托给 listRegisteredChannelPluginIds。
 */
export function listChannels(): ChannelId[] {
  return listRegisteredChannelPluginIds();
}

/**
 * Returns lightweight channel metadata used by message formatting and capability checks.
 */
export function getRegisteredChannelPluginMeta(
  id: string,
): Pick<ChannelMeta, "aliases" | "markdownCapable"> | null {
  return findRegisteredChannelPluginEntryById(id)?.plugin.meta ?? null;
}

/**
 * Formats a concise channel primer line for setup/status flows.
 */
export function formatChannelPrimerLine(meta: ChannelMeta): string {
  return `${meta.label}: ${meta.blurb}`;
}

/**
 * Formats a docs-aware channel selection line for interactive setup prompts.
 */
export function formatChannelSelectionLine(
  meta: ChannelMeta,
  docsLink: (path: string, label?: string) => string,
): string {
  const docsPrefix = meta.selectionDocsPrefix ?? "Docs:";
  const docsLabel = meta.docsLabel ?? meta.id;
  const docs = meta.selectionDocsOmitLabel
    ? docsLink(meta.docsPath)
    : docsLink(meta.docsPath, docsLabel);
  const extras = (meta.selectionExtras ?? []).filter(Boolean).join(" ");
  return `${meta.label} — ${meta.blurb} ${docsPrefix ? `${docsPrefix} ` : ""}${docs}${extras ? ` ${extras}` : ""}`;
}
