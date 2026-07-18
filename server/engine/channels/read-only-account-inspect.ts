/**
 * Read-only channel account inspection facade — 移植自 openclaw/src/channels/read-only-account-inspect.ts
 *
 * 降级策略：
 *  - ../config/types.openclaw.js (OpenClawConfig) → cross-wms ../config/types/openclaw.js
 *  - ./plugins/bundled.js (getBundledChannelAccountInspector) → ./_openclaw-stubs.js
 *  - ./plugins/registry.js (getLoadedChannelPlugin) → ./_openclaw-stubs.js
 *  - ./plugins/types.public.js (ChannelId) → ./_openclaw-stubs.js
 *
 * 由于 cross-wms 的 plugins/registry.ts 与 plugins/bundled.ts 不提供 openclaw 的同名访问器，
 * 这里通过 stub 返回 undefined，inspectReadOnlyChannelAccount 在没有插件检查器时返回 null。
 */
import type { OpenClawConfig } from "../config/types/openclaw.js";
import {
  getBundledChannelAccountInspector,
  getLoadedChannelPlugin,
  type ChannelId,
} from "./_openclaw-stubs.js";

// Read-only account inspection facade for status/setup diagnostics. Prefer a
// loaded plugin inspector, then the lightweight bundled inspector artifact.
export type ReadOnlyInspectedAccount = Record<string, unknown>;

/** Inspects channel account config without loading mutable runtime surfaces. */
export async function inspectReadOnlyChannelAccount(params: {
  channelId: ChannelId;
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<ReadOnlyInspectedAccount | null> {
  const inspectAccount =
    getLoadedChannelPlugin(params.channelId)?.config.inspectAccount ??
    getBundledChannelAccountInspector(params.channelId);
  if (!inspectAccount) {
    return null;
  }
  return (await Promise.resolve(
    // ChannelPlugin 契约要求 accountId 为 string，但本函数对外接受 null/undefined。
    // stub 实现下 inspectAccount 始终返回 null，断言以兼容契约。
    inspectAccount(params.cfg, params.accountId as string),
  )) as ReadOnlyInspectedAccount | null;
}
