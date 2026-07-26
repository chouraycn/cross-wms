// Configured media size helpers resolve maximum byte limits by media kind.
// Ported from openclaw/src/media/configured-max-bytes.ts.
//
// Dependency adjustments:
//   - @openclaw/media-core/constants maxBytesForKind, MediaKind
//     → ./_openclaw-media-stubs.js (already re-exports both)
//   - ../config/types.openclaw.js OpenClawConfig
//     → cross-wms 的完整 OpenClawConfig 类型尚未移植。这里按 openclaw 源访问的
//       字段子集定义最小本地 stub OpenClawConfigLike，调用方传入的完整 cfg
//       对象可通过结构子集化赋值给此类型。这与 server/engine/channels/
//       conversation-label.ts 中 MsgContext 的降级策略一致。
import { maxBytesForKind, type MediaKind } from "./_openclaw-media-stubs.js";

/**
 * Minimal OpenClawConfig shape consumed by configured-max-bytes helpers.
 *
 * openclaw 中 OpenClawConfig 包含 agents/channels/gateway/tools 等大量字段，
 * 这里仅保留 resolveConfiguredMediaMaxBytes / resolveChannelAccountMediaMaxMb
 * 访问的字段子集，调用方传入的完整对象可通过结构子集化赋值给此类型。
 */
type OpenClawConfigLike = {
  agents?: {
    defaults?: {
      mediaMaxMb?: number;
    };
  };
  channels?: Record<
    string,
    {
      mediaMaxMb?: number;
      accounts?: Record<string, { mediaMaxMb?: number }>;
    }
  >;
};

const MB = 1024 * 1024;

/** Resolves the global generated-media byte cap from the user-facing MB config value. */
export function resolveConfiguredMediaMaxBytes(cfg?: OpenClawConfigLike): number | undefined {
  const configured = cfg?.agents?.defaults?.mediaMaxMb;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured * MB);
  }
  return undefined;
}

/** Returns the configured media cap, falling back to the media-core per-kind default. */
export function resolveGeneratedMediaMaxBytes(
  cfg: OpenClawConfigLike | undefined,
  kind: MediaKind,
) {
  return resolveConfiguredMediaMaxBytes(cfg) ?? maxBytesForKind(kind);
}

/** Reads channel/account media caps from raw channel config without requiring typed account schemas. */
export function resolveChannelAccountMediaMaxMb(params: {
  cfg: OpenClawConfigLike;
  channel?: string | null;
  accountId?: string | null;
}): number | undefined {
  const channelId = params.channel?.trim();
  const accountId = params.accountId?.trim();
  const channelCfg = channelId ? params.cfg.channels?.[channelId] : undefined;
  const channelObj =
    channelCfg && typeof channelCfg === "object"
      ? (channelCfg as Record<string, unknown>)
      : undefined;
  const channelMediaMax =
    typeof channelObj?.mediaMaxMb === "number" ? channelObj.mediaMaxMb : undefined;
  const accountsObj =
    channelObj?.accounts && typeof channelObj.accounts === "object"
      ? (channelObj.accounts as Record<string, unknown>)
      : undefined;
  const accountCfg = accountId && accountsObj ? accountsObj[accountId] : undefined;
  const accountMediaMax =
    accountCfg && typeof accountCfg === "object"
      ? (accountCfg as Record<string, unknown>).mediaMaxMb
      : undefined;
  return (typeof accountMediaMax === "number" ? accountMediaMax : undefined) ?? channelMediaMax;
}
