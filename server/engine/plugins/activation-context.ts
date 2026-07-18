/**
 * Builds plugin activation context from config, discovery, and manifests.
 * 移植自 openclaw/src/plugins/activation-context.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginActivationCompatConfig = unknown;

export type PluginActivationBundledCompatMode = unknown;

export type PluginActivationInputs = unknown;

export type PluginActivationSnapshot = unknown;

export type BundledPluginCompatibleActivationInputs = unknown;

export type BundledPluginCompatibleLoadValues = unknown;

export function withActivatedPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: withActivatedPluginIds");
}

export function applyPluginCompatibilityOverrides(...args: unknown[]): unknown {
  throw new Error("not implemented: applyPluginCompatibilityOverrides");
}

export function resolvePluginActivationSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginActivationSnapshot");
}

export function resolvePluginActivationInputs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginActivationInputs");
}

export function resolveBundledPluginCompatibleActivationInputs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledPluginCompatibleActivationInputs");
}

export function resolveBundledPluginCompatibleLoadValues(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledPluginCompatibleLoadValues");
}

