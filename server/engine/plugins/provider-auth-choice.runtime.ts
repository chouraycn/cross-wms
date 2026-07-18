/**
 * Runtime boundary for resolving provider auth choices from plugins.
 * 移植自 openclaw/src/plugins/provider-auth-choice.runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveProviderPluginChoice(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveProviderPluginChoice");
}

export function runProviderModelSelectedHook(...args: unknown[]): unknown {
  throw new Error("not implemented: runProviderModelSelectedHook");
}

export function resolvePluginProviders(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginProviders");
}

export function resolvePluginSetupProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupProvider");
}

