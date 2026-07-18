/**
 * Shared resolver for channel live-preview draft chunk thresholds.
 * 移植自 openclaw/src/channels/draft-streaming-chunking.ts
 *
 * 降级策略：
 *  - ../auto-reply/chunk.js (resolveTextChunkLimit) → ./_openclaw-stubs.js
 *  - ../config/types.openclaw.js (OpenClawConfig) → cross-wms ../config/types/openclaw.js
 *  - ../routing/account-lookup.js (resolveAccountEntry) → ./_openclaw-stubs.js
 *  - ../routing/session-key.js (normalizeAccountId) → ./_openclaw-stubs.js
 *  - ./plugins/types.core.js (ChannelId) → ./_openclaw-stubs.js
 *  - ./streaming.js (resolveChannelStreamingPreviewChunk, StreamingCompatEntry) →
 *    ./_openclaw-stubs.js
 */
import {
  resolveAccountEntry,
  resolveChannelStreamingPreviewChunk,
  resolveTextChunkLimit,
  normalizeAccountId,
  type ChannelId,
  type StreamingCompatEntry,
} from "./_openclaw-stubs.js";
import type { OpenClawConfig } from "../config/types/openclaw.js";

const DEFAULT_DRAFT_STREAM_MIN = 200;
const DEFAULT_DRAFT_STREAM_MAX = 800;

export type ChannelDraftStreamingChunking = {
  minChars: number;
  maxChars: number;
  breakPreference: "paragraph" | "newline" | "sentence";
};

type ChannelDraftStreamingConfig = StreamingCompatEntry & {
  accounts?: Record<string, StreamingCompatEntry | undefined>;
};

export function resolveChannelDraftStreamingChunking(
  cfg: OpenClawConfig | undefined,
  channelId: ChannelId,
  accountId: string | null | undefined,
  opts: { fallbackLimit: number },
): ChannelDraftStreamingChunking {
  const textLimit = resolveTextChunkLimit(cfg, channelId, accountId, {
    fallbackLimit: opts.fallbackLimit,
  });
  const normalizedAccountId = normalizeAccountId(accountId);
  const channelCfg = cfg?.channels?.[channelId] as ChannelDraftStreamingConfig | undefined;
  const accountCfg = resolveAccountEntry(channelCfg?.accounts, normalizedAccountId) as
    | StreamingCompatEntry
    | undefined;
  const draftCfg =
    resolveChannelStreamingPreviewChunk(accountCfg) ??
    resolveChannelStreamingPreviewChunk(channelCfg);

  const maxRequested = Math.max(1, Math.floor(draftCfg?.maxChars ?? DEFAULT_DRAFT_STREAM_MAX));
  const maxChars = Math.max(1, Math.min(maxRequested, textLimit));
  const minRequested = Math.max(1, Math.floor(draftCfg?.minChars ?? DEFAULT_DRAFT_STREAM_MIN));
  const minChars = Math.min(minRequested, maxChars);
  const breakPreference =
    draftCfg?.breakPreference === "newline" || draftCfg?.breakPreference === "sentence"
      ? draftCfg.breakPreference
      : "paragraph";
  return { minChars, maxChars, breakPreference };
}
