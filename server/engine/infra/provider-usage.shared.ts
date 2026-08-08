// 移植自 openclaw/src/infra/provider-usage.shared.ts

export function isOAuthOnlyUsageProvider(...args: unknown[]): unknown {
  return false;
}
export function resolveUsageProviderId(...args: unknown[]): unknown {
  return undefined;
}
export const DEFAULT_TIMEOUT_MS: unknown = undefined as unknown;
export const PROVIDER_LABELS: unknown = undefined as unknown;
export const usageProviders: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const ignoredErrors: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const clampPercent: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const withTimeout: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
