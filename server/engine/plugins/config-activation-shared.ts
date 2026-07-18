/**
 * Shares plugin activation state helpers across config and registry code.
 * 移植自 openclaw/src/plugins/config-activation-shared.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginActivationSource = unknown;

export type PluginExplicitSelectionCause = unknown;

export type PluginActivationCause = unknown;

export type PluginActivationStateLike = unknown;

export type PluginActivationDecision = unknown;

export type PluginActivationConfigSourceLike = unknown;

export const PLUGIN_ACTIVATION_REASON_BY_CAUSE: Record<string, string> = {};

export function resolvePluginActivationReason(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginActivationReason");
}

export function toPluginActivationState(...args: unknown[]): unknown {
  throw new Error("not implemented: toPluginActivationState");
}

export function resolvePluginActivationDecisionShared(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginActivationDecisionShared");
}

export function toEnableStateResult(...args: unknown[]): unknown {
  throw new Error("not implemented: toEnableStateResult");
}

export function resolveEnableStateResult(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEnableStateResult");
}

export function createPluginEnableStateResolver(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginEnableStateResolver");
}

export function createEffectiveEnableStateResolver(...args: unknown[]): unknown {
  throw new Error("not implemented: createEffectiveEnableStateResolver");
}

export function resolveMemorySlotDecisionShared(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMemorySlotDecisionShared");
}

