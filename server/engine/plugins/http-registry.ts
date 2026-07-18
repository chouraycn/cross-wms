/**
 * Tracks plugin HTTP registry context for current async execution.
 * 移植自 openclaw/src/plugins/http-registry.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginHttpRouteHandler = unknown;

export function withPluginHttpRouteRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: withPluginHttpRouteRegistry");
}

export function registerPluginHttpRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: registerPluginHttpRoute");
}

