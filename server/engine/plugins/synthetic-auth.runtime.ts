/**
 * * Resolves synthetic and external auth provider refs from active runtime state or persisted manifests.
 * 移植自 openclaw/src/plugins/synthetic-auth.runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveRuntimeSyntheticAuthProviderRefs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeSyntheticAuthProviderRefs");
}

export function resolveRuntimeSyntheticAuthProviderRefState(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeSyntheticAuthProviderRefState");
}

export function resolveRuntimeExternalAuthProviderRefs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeExternalAuthProviderRefs");
}

