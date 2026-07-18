/**
 * Session-envelope context resolver for inbound channel turns.
 * 移植自 openclaw/src/channels/session-envelope.ts
 *
 * 降级策略：
 *  - ../auto-reply/envelope.js (resolveEnvelopeFormatOptions) → ./_openclaw-stubs.js
 *  - ../config/sessions.js (readSessionUpdatedAt, resolveStorePath) → ./_openclaw-stubs.js
 *  - ../config/types.openclaw.js (OpenClawConfig) → cross-wms ../config/types/openclaw.js
 *
 * 由于 cross-wms 的 auto-reply/ 与 config/sessions 实现与 openclaw 不同，
 * stub 返回 undefined / 空对象，调用方需自行处理缺失 storePath/envelopeOptions 的情况。
 */
import type { OpenClawConfig } from "../config/types/openclaw.js";
import {
  readSessionUpdatedAt,
  resolveEnvelopeFormatOptions,
  resolveStorePath,
} from "./_openclaw-stubs.js";

/** Resolves envelope options and previous timestamp for one inbound channel session. */
export function resolveInboundSessionEnvelopeContext(params: {
  cfg: OpenClawConfig;
  agentId: string;
  sessionKey: string;
}) {
  const storePath = resolveStorePath(params.cfg.session?.store, {
    agentId: params.agentId,
  });
  return {
    storePath,
    envelopeOptions: resolveEnvelopeFormatOptions(params.cfg),
    previousTimestamp: readSessionUpdatedAt({
      storePath,
      sessionKey: params.sessionKey,
    }),
  };
}
