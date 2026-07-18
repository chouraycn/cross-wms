/**
 * Resolves plugin enablement state from config and channel context.
 * 移植自 openclaw/src/plugins/enable.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginEnableResult = unknown;

export function enablePluginInConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: enablePluginInConfig");
}

export function enableExplicitlySelectedPluginInConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: enableExplicitlySelectedPluginInConfig");
}

