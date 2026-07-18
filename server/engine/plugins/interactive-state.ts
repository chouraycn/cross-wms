/**
 * Stores interactive plugin state and dedupe caches.
 * 移植自 openclaw/src/plugins/interactive-state.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type RegisteredInteractiveHandler = unknown;

export function getPluginInteractiveHandlersState(...args: unknown[]): unknown {
  throw new Error("not implemented: getPluginInteractiveHandlersState");
}

export function claimPluginInteractiveCallbackDedupe(...args: unknown[]): unknown {
  throw new Error("not implemented: claimPluginInteractiveCallbackDedupe");
}

export function commitPluginInteractiveCallbackDedupe(...args: unknown[]): unknown {
  throw new Error("not implemented: commitPluginInteractiveCallbackDedupe");
}

export function releasePluginInteractiveCallbackDedupe(...args: unknown[]): unknown {
  throw new Error("not implemented: releasePluginInteractiveCallbackDedupe");
}

export function clearPluginInteractiveHandlersState(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginInteractiveHandlersState");
}

export function clearPluginInteractiveHandlerRegistrationsState(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginInteractiveHandlerRegistrationsState");
}

