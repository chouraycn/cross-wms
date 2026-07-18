/**
 * Shares bundled plugin config merge behavior across setup and runtime code.
 * 移植自 openclaw/src/plugins/bundle-config-shared.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type BundleServerRuntimeSupport = unknown;

export function readBundleJsonObject(...args: unknown[]): unknown {
  throw new Error("not implemented: readBundleJsonObject");
}

export function resolveBundleJsonOpenFailure(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundleJsonOpenFailure");
}

export function inspectBundleServerRuntimeSupport(...args: unknown[]): unknown {
  throw new Error("not implemented: inspectBundleServerRuntimeSupport");
}

export function loadEnabledBundleConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: loadEnabledBundleConfig");
}

