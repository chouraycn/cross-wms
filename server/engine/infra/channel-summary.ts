// 移植自 openclaw/src/infra/channel-summary.ts
// 降级：channel plugin / config / terminal-core 依赖简化

/** Builds a simplified channel summary. */
export async function buildChannelSummary(
  _cfg?: unknown,
  _options?: { colorize?: boolean; includeAllowFrom?: boolean },
): Promise<string[]> {
  // Simplified: no real channel plugin enumeration in cross-wms
  return [];
}
