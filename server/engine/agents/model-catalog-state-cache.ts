/**
 * 移植自 openclaw/src/agents/model-catalog-state-cache.ts
 *
 * 降级实现：提供模型目录状态缓存，不再抛出 stub 错误。
 */

export function buildAgentModelCatalogCacheKey(params: { agentId?: string; provider?: string }): string {
  return `${params.agentId ?? "default"}:${params.provider ?? "unknown"}`;
}

export function readCachedAgentModelCatalog(_params: unknown): unknown {
  return null;
}

export function writeCachedAgentModelCatalog(_params: unknown): void {
  // no-op in cross-wms降级实现
}
