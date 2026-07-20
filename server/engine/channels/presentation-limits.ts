// 移植自 openclaw/src/channels/plugins/outbound/presentation-limits.ts
// 降级：channel plugin 依赖简化

export type PresentationLimitConfig = {
  maxButtons?: number;
  maxTextLength?: number;
  maxBlocks?: number;
};

const DEFAULT_PRESENTATION_LIMITS: PresentationLimitConfig = {
  maxButtons: 5,
  maxTextLength: 3000,
  maxBlocks: 50,
};

/** Adapts a message presentation for channel-specific limits. */
export function adaptMessagePresentationForChannel(params: {
  presentation?: unknown;
  channel?: string;
  limits?: PresentationLimitConfig;
}): unknown {
  return params.presentation;
}

/** Applies presentation action limits, truncating if necessary. */
export function applyPresentationActionLimits(params: {
  presentation?: { blocks?: unknown[] };
  limits?: PresentationLimitConfig;
}): { presentation: unknown; truncated: boolean } {
  const limits = { ...DEFAULT_PRESENTATION_LIMITS, ...params.limits };
  if (!params.presentation) return { presentation: undefined, truncated: false };
  const blocks = params.presentation.blocks ?? [];
  const truncated = blocks.length > (limits.maxBlocks ?? 50);
  return {
    presentation: truncated ? { ...params.presentation, blocks: blocks.slice(0, limits.maxBlocks) } : params.presentation,
    truncated,
  };
}

/** Returns the presentation page size for a channel. */
export function presentationPageSize(channel?: string): number {
  return DEFAULT_PRESENTATION_LIMITS.maxBlocks ?? 50;
}
