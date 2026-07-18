/**
 * Maintains channel catalog entries advertised by plugins.
 * 移植自 openclaw/src/plugins/channel-catalog-registry.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginChannelCatalogEntry = unknown;

export function listChannelCatalogEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: listChannelCatalogEntries");
}

