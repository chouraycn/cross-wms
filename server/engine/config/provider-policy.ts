// 移植自 openclaw/src/config/provider-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeProviderConfigForConfigDefaults(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeProviderConfigForConfigDefaults");
}
export function applyProviderConfigDefaultsForConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: applyProviderConfigDefaultsForConfig");
}
