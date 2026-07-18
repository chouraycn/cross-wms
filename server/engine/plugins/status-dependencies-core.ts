/**
 * Collects core dependency status for plugin diagnostics.
 * 移植自 openclaw/src/plugins/status-dependencies-core.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginDependencySpecMap = unknown;

export type PluginDependencyEntry = unknown;

export type PluginDependencyStatus = unknown;

export function normalizePluginDependencySpecs(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizePluginDependencySpecs");
}

export function buildPluginDependencyStatus(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginDependencyStatus");
}

