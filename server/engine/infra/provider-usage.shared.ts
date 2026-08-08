// 移植自 openclaw/src/infra/provider-usage.shared.ts

export function isOAuthOnlyUsageProvider(...args: any[]): any {
  return false;
}
export function resolveUsageProviderId(...args: any[]): any {
  return undefined;
}
export const DEFAULT_TIMEOUT_MS: any = undefined as any;
export const PROVIDER_LABELS: any = undefined as any;
export const usageProviders: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const ignoredErrors: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const clampPercent: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const withTimeout: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
