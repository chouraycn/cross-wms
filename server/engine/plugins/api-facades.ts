/**
 * Builds plugin API facades exposed to bundled and external plugins.
 * 移植自 openclaw/src/plugins/api-facades.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type OpenClawPluginApiWithoutFacades = unknown;

export function attachPluginApiFacades(...args: unknown[]): unknown {
  throw new Error("not implemented: attachPluginApiFacades");
}

