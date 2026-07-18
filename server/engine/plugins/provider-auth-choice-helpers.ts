/**
 * Normalizes provider auth choice metadata from plugin setup surfaces.
 * 移植自 openclaw/src/plugins/provider-auth-choice-helpers.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveProviderMatch(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveProviderMatch");
}

export function pickAuthMethod(...args: unknown[]): unknown {
  throw new Error("not implemented: pickAuthMethod");
}

export function applyProviderAuthConfigPatch(...args: unknown[]): unknown {
  throw new Error("not implemented: applyProviderAuthConfigPatch");
}

export function restorePriorAgentsDefaultsModelUnlessOptIn(...args: unknown[]): unknown {
  throw new Error("not implemented: restorePriorAgentsDefaultsModelUnlessOptIn");
}

export function applyDefaultModel(...args: unknown[]): unknown {
  throw new Error("not implemented: applyDefaultModel");
}

