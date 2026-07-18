/**
 * Builds web-search install catalog entries from plugin metadata.
 * 移植自 openclaw/src/plugins/web-search-install-catalog.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type WebSearchInstallCatalogEntry = unknown;

export function resolveWebSearchInstallCatalogEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveWebSearchInstallCatalogEntries");
}

export function resolveWebSearchInstallCatalogEntriesForEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveWebSearchInstallCatalogEntriesForEnv");
}

export function resolveWebSearchInstallCatalogEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveWebSearchInstallCatalogEntry");
}

