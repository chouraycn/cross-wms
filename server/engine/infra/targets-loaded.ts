// 移植自 openclaw/src/infra/targets-loaded.ts
// 降级：channel plugin 依赖简化

/** Attempts to resolve a loaded outbound target. Simplified without channel plugin access. */
export function tryResolveLoadedOutboundTarget(params: {
  channel: string;
  target?: string;
  cfg?: unknown;
}): { channel: string; target: string } | null {
  if (!params.channel?.trim() || !params.target?.trim()) return null;
  return { channel: params.channel.trim(), target: params.target.trim() };
}
