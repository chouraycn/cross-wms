// 移植自 openclaw/src/infra/provider-usage.shared.ts

export function isOAuthOnlyUsageProvider(...args: unknown[]): unknown {
  return false;
}
export function resolveUsageProviderId(...args: unknown[]): unknown {
  return undefined;
}
export const DEFAULT_TIMEOUT_MS: unknown = undefined as unknown;
export const PROVIDER_LABELS: unknown = undefined as unknown;
export const usageProviders: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const ignoredErrors: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const clampPercent: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const withTimeout: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
