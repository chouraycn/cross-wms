/**
 * Builds plugin API objects from config, registries, and runtime helpers.
 * 移植自 openclaw/src/plugins/api-builder.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type BuildPluginApiParams = unknown;

export function buildPluginApi(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginApi");
}

