// 移植自 openclaw/src/infra/provider-usage.shared.ts

export function isOAuthOnlyUsageProvider(...args: unknown[]): unknown {
  return false;
}
export function resolveUsageProviderId(...args: unknown[]): unknown {
  return undefined;
}
export const DEFAULT_TIMEOUT_MS: unknown = undefined;
export const PROVIDER_LABELS: unknown = undefined;
export const usageProviders: unknown = undefined;
export const ignoredErrors: unknown = undefined;
export const clampPercent: unknown = undefined;
export const withTimeout: unknown = undefined;
