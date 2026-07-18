/**
 * Channel id normalization through the active plugin registry.
 * 移植自 openclaw/src/channels/registry-normalize.ts
 *
 * 降级策略：
 *  - @openclaw/normalization-core/string-coerce (normalizeOptionalLowercaseString) →
 *    cross-wms ../infra/string-coerce.js
 *  - ./plugins/channel-id.types.js (ChannelId) → ./_openclaw-stubs.js
 *  - ./registry-lookup.js → 本目录已移植
 *
 * 降级行为：由于 registry-lookup 始终找不到 entry（stub 注册表为空），
 * normalizeAnyChannelId 返回 null。
 */
import { normalizeOptionalLowercaseString } from "../infra/string-coerce.js";
import { type ChannelId } from "./_openclaw-stubs.js";
import { findRegisteredChannelPluginEntry } from "./registry-lookup.js";

/** Normalizes user/config channel identifiers so aliases resolve to canonical channel ids. */
export function normalizeAnyChannelId(raw?: string | null): ChannelId | null {
  const key = normalizeOptionalLowercaseString(raw);
  if (!key) {
    return null;
  }
  return findRegisteredChannelPluginEntry(key)?.plugin.id ?? null;
}
