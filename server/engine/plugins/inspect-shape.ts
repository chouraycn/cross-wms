/**
 * Inspects plugin registry shape for diagnostics and snapshots.
 * 移植自 openclaw/src/plugins/inspect-shape.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginCapabilityKind = unknown;

export type PluginInspectShape = unknown;

export type PluginCapabilityEntry = unknown;

export type PluginShapeSummary = unknown;

export function buildPluginShapeSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginShapeSummary");
}

