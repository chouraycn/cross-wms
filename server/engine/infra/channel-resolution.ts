// 移植自 openclaw/src/infra/channel-resolution.ts
// 降级：channel plugin 依赖简化

const testState = new Map<string, unknown>();

/** Resets outbound channel resolution state (for tests). */
export function resetOutboundChannelResolutionStateForTest(): void {
  testState.clear();
}

/** Normalizes a channel name into a deliverable outbound channel id. */
export function normalizeDeliverableOutboundChannel(channel: string): string | undefined {
  const trimmed = channel?.trim().toLowerCase();
  if (!trimmed) return undefined;
  return trimmed;
}

/** Resolves the outbound channel plugin for a given channel. */
export function resolveOutboundChannelPlugin(params: {
  channel: string;
  cfg?: unknown;
  allowBootstrap?: boolean;
}): unknown | null {
  // Simplified: no real plugin registry
  return null;
}

/** Resolves the outbound channel message adapter for a given channel. */
export function resolveOutboundChannelMessageAdapter(params: {
  channel: string;
  cfg?: unknown;
}): unknown | null {
  // Simplified: no real adapter registry
  return null;
}
