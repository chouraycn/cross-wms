/**
 * Stores active runtime plugin registry state and activation metadata.
 * 移植自 openclaw/src/plugins/active-runtime-registry.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ActiveRuntimePluginRegistrySurface = unknown;

export function getActiveRuntimePluginRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: getActiveRuntimePluginRegistry");
}

export function registryContainsRuntimePluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: registryContainsRuntimePluginIds");
}

export function getLoadedRuntimePluginRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: getLoadedRuntimePluginRegistry");
}

