// 移植自 openclaw/src/infra/provider-usage.shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isOAuthOnlyUsageProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: isOAuthOnlyUsageProvider");
}
export function resolveUsageProviderId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveUsageProviderId");
}
export const DEFAULT_TIMEOUT_MS: unknown = undefined;
export const PROVIDER_LABELS: unknown = undefined;
export const usageProviders: unknown = undefined;
export const ignoredErrors: unknown = undefined;
export const clampPercent: unknown = undefined;
export const withTimeout: unknown = undefined;
