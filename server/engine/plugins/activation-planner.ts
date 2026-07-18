/**
 * * Computes which manifest-owned plugins need activation for commands, routes, providers, or capabilities.
 * 移植自 openclaw/src/plugins/activation-planner.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginActivationPlannerTrigger = unknown;

export type PluginActivationPlannerHintReason = unknown;

export type PluginActivationPlannerManifestReason = unknown;

export type PluginActivationPlannerReason = unknown;

export type PluginActivationPlanEntry = unknown;

export type PluginActivationPlan = unknown;

export function resolveManifestActivationPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestActivationPlan");
}

export function resolveManifestActivationPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestActivationPluginIds");
}

