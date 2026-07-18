/**
 * Bundles language-server metadata exposed by plugins.
 * 移植自 openclaw/src/plugins/bundle-lsp.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type BundleLspServerConfig = unknown;

export type BundleLspConfig = unknown;

export type BundleLspRuntimeSupport = unknown;

export function inspectBundleLspRuntimeSupport(...args: unknown[]): unknown {
  throw new Error("not implemented: inspectBundleLspRuntimeSupport");
}

export function loadEnabledBundleLspConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: loadEnabledBundleLspConfig");
}

