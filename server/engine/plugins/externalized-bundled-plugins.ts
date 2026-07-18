/**
 * Defines metadata for bundled plugins that are installed externally.
 * 移植自 openclaw/src/plugins/externalized-bundled-plugins.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ExternalizedBundledPluginPreferredSource = unknown;

export type ExternalizedBundledPluginBridge = unknown;

export function getExternalizedBundledPluginPreferredSource(...args: unknown[]): unknown {
  throw new Error("not implemented: getExternalizedBundledPluginPreferredSource");
}

export function getExternalizedBundledPluginNpmSpec(...args: unknown[]): unknown {
  throw new Error("not implemented: getExternalizedBundledPluginNpmSpec");
}

export function getExternalizedBundledPluginClawHubSpec(...args: unknown[]): unknown {
  throw new Error("not implemented: getExternalizedBundledPluginClawHubSpec");
}

export function getExternalizedBundledPluginTargetId(...args: unknown[]): unknown {
  throw new Error("not implemented: getExternalizedBundledPluginTargetId");
}

export function getExternalizedBundledPluginLookupIds(...args: unknown[]): unknown {
  throw new Error("not implemented: getExternalizedBundledPluginLookupIds");
}

export function getExternalizedBundledPluginLegacyPathSuffix(...args: unknown[]): unknown {
  throw new Error("not implemented: getExternalizedBundledPluginLegacyPathSuffix");
}

