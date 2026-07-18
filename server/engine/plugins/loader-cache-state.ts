/**
 * * Cache state helper for plugin loader registries, in-flight loads, and warning suppression.
 * 移植自 openclaw/src/plugins/loader-cache-state.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export class PluginLoadReentryError { constructor(...args: unknown[]) { throw new Error("not implemented: PluginLoadReentryError"); } }

export class PluginLoaderCacheState { constructor(...args: unknown[]) { throw new Error("not implemented: PluginLoaderCacheState"); } }

