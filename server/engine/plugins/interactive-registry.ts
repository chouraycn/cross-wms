/**
 * Maintains interactive plugin registry entries discovered from manifests.
 * 移植自 openclaw/src/plugins/interactive-registry.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type InteractiveRegistrationResult = unknown;

export function resolvePluginInteractiveNamespaceMatch(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginInteractiveNamespaceMatch");
}

export function registerPluginInteractiveHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: registerPluginInteractiveHandler");
}

export function clearPluginInteractiveHandlers(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginInteractiveHandlers");
}

export function clearPluginInteractiveHandlerRegistrations(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginInteractiveHandlerRegistrations");
}

export function clearPluginInteractiveHandlersForPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginInteractiveHandlersForPlugin");
}

export function listPluginInteractiveHandlers(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginInteractiveHandlers");
}

export function restorePluginInteractiveHandlers(...args: unknown[]): unknown {
  throw new Error("not implemented: restorePluginInteractiveHandlers");
}

