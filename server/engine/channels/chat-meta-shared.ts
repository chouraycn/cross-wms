/**
 * Built-in chat channel metadata builder. — 移植自 openclaw/src/channels/chat-meta-shared.ts
 *
 * 降级策略：
 *  - @openclaw/normalization-core/string-coerce (normalizeOptionalString) →
 *    cross-wms ../infra/string-coerce.js
 *  - ../plugins/manifest.js (PluginPackageChannel) → ./_openclaw-stubs.js
 *  - ./bundled-channel-catalog-read.js (listBundledChannelCatalogEntries) → 本目录已移植
 *  - ./ids.js (CHAT_CHANNEL_ORDER, ChatChannelId) → ./_openclaw-stubs.js
 *  - ./plugins/channel-meta.js (buildManifestChannelMeta) → ./_openclaw-stubs.js
 *  - ./plugins/types.core.js (ChannelMeta) → ./_openclaw-stubs.js
 *
 * 降级行为：由于 CHAT_CHANNEL_ORDER stub 为空数组且 bundled-channel-catalog-read
 * 始终返回空数组，buildChatChannelMetaById 返回空 frozen 对象。
 */
import { normalizeOptionalString } from "../infra/string-coerce.js";
import {
  CHAT_CHANNEL_ORDER,
  buildManifestChannelMeta,
  type ChannelMeta,
  type ChatChannelId,
  type PluginPackageChannel,
} from "./_openclaw-stubs.js";
import { listBundledChannelCatalogEntries } from "./bundled-channel-catalog-read.js";

/**
 * Metadata shown for built-in chat channels in setup, status, and selection UIs.
 */
export type ChatChannelMeta = ChannelMeta;

const CHAT_CHANNEL_ID_SET = new Set<string>(CHAT_CHANNEL_ORDER);

function toChatChannelMeta(params: {
  id: ChatChannelId;
  channel: PluginPackageChannel;
}): ChatChannelMeta {
  const label = normalizeOptionalString(params.channel.label);
  if (!label) {
    throw new Error(`Missing label for bundled chat channel "${params.id}"`);
  }

  return buildManifestChannelMeta({
    id: params.id,
    channel: params.channel,
    label,
    selectionLabel: normalizeOptionalString(params.channel.selectionLabel) || label,
    docsPath: normalizeOptionalString(params.channel.docsPath) || `/channels/${params.id}`,
    docsLabel: normalizeOptionalString(params.channel.docsLabel),
    blurb: normalizeOptionalString(params.channel.blurb) || "",
    detailLabel: normalizeOptionalString(params.channel.detailLabel),
    systemImage: normalizeOptionalString(params.channel.systemImage),
    arrayFieldMode: "non-empty",
    selectionDocsPrefixMode: "defined",
  });
}

export function buildChatChannelMetaById(): Record<ChatChannelId, ChatChannelMeta> {
  const entries = new Map<ChatChannelId, ChatChannelMeta>();

  for (const entry of listBundledChannelCatalogEntries()) {
    // The catalog can contain non-chat bundled channels. Keep this map restricted to the
    // generated chat-channel order so setup/status views stay stable.
    const rawId = normalizeOptionalString(entry.id);
    if (!rawId || !CHAT_CHANNEL_ID_SET.has(rawId)) {
      continue;
    }
    const id = rawId;
    entries.set(
      id,
      toChatChannelMeta({
        id,
        channel: entry.channel,
      }),
    );
  }

  return Object.freeze(Object.fromEntries(entries)) as Record<ChatChannelId, ChatChannelMeta>;
}
