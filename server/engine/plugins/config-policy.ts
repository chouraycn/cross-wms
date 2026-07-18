/**
 * Evaluates plugin config policy without activating plugin runtime code.
 * 移植自 openclaw/src/plugins/config-policy.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

// Re-export: export type { PluginActivationSource };

export type PluginActivationState = unknown;

export type NormalizedPluginsConfig = unknown;

export function normalizePluginsConfigWithResolver(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizePluginsConfigWithResolver");
}

export function resolvePluginActivationState(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginActivationState");
}

export const hasExplicitPluginConfig: unknown = undefined;

export const isBundledChannelEnabledByChannelConfig: unknown = undefined;

export function resolveEffectivePluginActivationState(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEffectivePluginActivationState");
}

export function resolveMemorySlotDecision(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMemorySlotDecision");
}

