/**
 * *
 * 移植自 openclaw/src/plugins/hook-runner-global.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function initializeGlobalHookRunner(...args: unknown[]): unknown {
  throw new Error("not implemented: initializeGlobalHookRunner");
}

export function getGlobalHookRunner(...args: unknown[]): unknown {
  throw new Error("not implemented: getGlobalHookRunner");
}

export function getGlobalPluginRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: getGlobalPluginRegistry");
}

export function hasGlobalHooks(...args: unknown[]): unknown {
  throw new Error("not implemented: hasGlobalHooks");
}


export function resetGlobalHookRunner(...args: unknown[]): unknown {
  throw new Error("not implemented: resetGlobalHookRunner");
}

