/**
 * Channel inbound debounce policy. — 移植自 openclaw/src/channels/inbound-debounce-policy.ts
 *
 * 降级策略：
 *  - @openclaw/normalization-core/string-coerce (normalizeOptionalString) →
 *    cross-wms ../infra/string-coerce.js
 *  - ../auto-reply/command-detection.js (isControlCommandMessage) → ./_openclaw-stubs.js
 *  - ../auto-reply/commands-registry.js (CommandNormalizeOptions) → ./_openclaw-stubs.js
 *  - ../auto-reply/inbound-debounce.js (createInboundDebouncer, resolveInboundDebounceMs,
 *    InboundDebounceCreateParams) → ./_openclaw-stubs.js
 *  - ../config/types.js (OpenClawConfig) → cross-wms ../config/types/openclaw.js
 *
 * 降级行为：stub 中 isControlCommandMessage 始终返回 false（即所有文本都"可去抖动"），
 * resolveInboundDebounceMs 返回 0，createInboundDebouncer 返回 no-op。
 */
import { normalizeOptionalString } from "../infra/string-coerce.js";
import {
  createInboundDebouncer,
  isControlCommandMessage,
  resolveInboundDebounceMs,
  type CommandNormalizeOptions,
  type InboundDebounceCreateParams,
} from "./_openclaw-stubs.js";
import type { OpenClawConfig } from "../config/types/openclaw.js";

/** Returns true when an inbound text event is safe to debounce before dispatch. */
export function shouldDebounceTextInbound(params: {
  text: string | null | undefined;
  cfg: OpenClawConfig;
  hasMedia?: boolean;
  commandOptions?: CommandNormalizeOptions;
  allowDebounce?: boolean;
}): boolean {
  if (params.allowDebounce === false) {
    return false;
  }
  if (params.hasMedia) {
    // Media payloads carry per-message attachments; merging them into a debounced text batch can
    // detach the attachment metadata from the original inbound event.
    return false;
  }
  const text = normalizeOptionalString(params.text) ?? "";
  if (!text) {
    return false;
  }
  // Control commands must dispatch immediately so stop/abort/status requests are not delayed
  // behind normal conversation text.
  return !isControlCommandMessage(text, params.cfg, params.commandOptions);
}

/** Creates a channel-scoped inbound debouncer using config/default debounce timing. */
export function createChannelInboundDebouncer<T>(
  params: Omit<InboundDebounceCreateParams<T>, "debounceMs"> & {
    cfg: OpenClawConfig;
    channel: string;
    debounceMsOverride?: number;
  },
): {
  debounceMs: number;
  debouncer: ReturnType<typeof createInboundDebouncer<T>>;
} {
  const debounceMs = resolveInboundDebounceMs({
    cfg: params.cfg,
    channel: params.channel,
    overrideMs: params.debounceMsOverride,
  });
  const { cfg: _cfg, channel: _channel, debounceMsOverride: _override, ...rest } = params;
  // The lower-level debouncer only needs queue callbacks and timing. Strip config-only inputs so
  // future helper options do not accidentally leak into its runtime shape. 由于
  // InboundDebounceCreateParams 带有索引签名，rest 在解构后丢失了 onFlush 的具体类型信息，
  // 这里通过类型断言恢复完整契约。
  const debouncer = createInboundDebouncer<T>({
    debounceMs,
    ...rest,
  } as InboundDebounceCreateParams<T>);
  return { debounceMs, debouncer };
}
