/**
 * Runtime channel plugin registry facade.
 *
 * Lists, resolves, and normalizes active channel plugins with bundled fallback.
 */
import { normalizeOptionalString } from "@cdf-know/normalization-core/string-coerce";
import { normalizeAnyChannelId } from "../registry.js";
import { getBundledChannelPlugin } from "./bundled.js";
import {
  getLoadedChannelPluginById,
  getLoadedChannelPluginEntryById,
  listLoadedChannelPlugins,
} from "./registry-loaded.js";
import type { ChannelPlugin } from "./types.plugin.js";
import type { ChannelId } from "./types.public.js";

// 重导出 normalizeAnyChannelId，供 plugins/ 下其他文件（如 session-conversation.ts）
// 通过相对路径 ./registry.js 导入，避免运行时 SyntaxError。
export { normalizeAnyChannelId };

/**
 * Lists currently loaded channel plugins in registry order.
 */
export function listChannelPlugins(): ChannelPlugin[] {
  return listLoadedChannelPlugins() as ChannelPlugin[];
}

/**
 * Returns a loaded channel plugin without falling back to bundled metadata.
 */
export function getLoadedChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  const resolvedId = normalizeOptionalString(id) ?? "";
  if (!resolvedId) {
    return undefined;
  }
  return getLoadedChannelPluginById(resolvedId) as ChannelPlugin | undefined;
}

/**
 * Returns the package/install origin for a loaded channel plugin.
 */
export function getLoadedChannelPluginOrigin(id: ChannelId): string | undefined {
  const resolvedId = normalizeOptionalString(id) ?? "";
  if (!resolvedId) {
    return undefined;
  }
  return normalizeOptionalString(getLoadedChannelPluginEntryById(resolvedId)?.origin) ?? undefined;
}

/**
 * Returns the active channel plugin, with bundled fallback for built-in channels.
 */
export function getChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  const resolvedId = normalizeOptionalString(id) ?? "";
  if (!resolvedId) {
    return undefined;
  }
  // Loaded plugins win over bundled fallbacks so installed plugin state can pin
  // or override a bundled channel during runtime.
  return getLoadedChannelPlugin(resolvedId) ?? getBundledChannelPlugin(resolvedId);
}

/**
 * Normalizes user-facing channel aliases to canonical channel ids.
 */
export function normalizeChannelId(raw?: string | null): ChannelId | null {
  return normalizeAnyChannelId(raw);
}
