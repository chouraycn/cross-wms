/**
 * Shares interactive plugin metadata normalization across registries.
 * 移植自 openclaw/src/plugins/interactive-shared.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function toPluginInteractiveRegistryKey(...args: unknown[]): unknown {
  throw new Error("not implemented: toPluginInteractiveRegistryKey");
}

export function normalizePluginInteractiveNamespace(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizePluginInteractiveNamespace");
}

export function validatePluginInteractiveNamespace(...args: unknown[]): unknown {
  throw new Error("not implemented: validatePluginInteractiveNamespace");
}

export function resolvePluginInteractiveMatch(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginInteractiveMatch");
}

