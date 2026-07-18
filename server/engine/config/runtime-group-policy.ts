// 移植自 openclaw/src/config/runtime-group-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveRuntimeGroupPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeGroupPolicy");
}
export function resolveDefaultGroupPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDefaultGroupPolicy");
}
export function resolveOpenProviderRuntimeGroupPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOpenProviderRuntimeGroupPolicy");
}
export function resolveAllowlistProviderRuntimeGroupPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowlistProviderRuntimeGroupPolicy");
}
export function warnMissingProviderGroupPolicyFallbackOnce(...args: unknown[]): unknown {
  throw new Error("not implemented: warnMissingProviderGroupPolicyFallbackOnce");
}
export function resetMissingProviderGroupPolicyFallbackWarningsForTesting(...args: unknown[]): unknown {
  throw new Error("not implemented: resetMissingProviderGroupPolicyFallbackWarningsForTesting");
}
export const GROUP_POLICY_BLOCKED_LABEL: unknown = undefined;
