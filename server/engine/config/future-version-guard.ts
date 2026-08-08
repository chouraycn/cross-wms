// 移植自 openclaw/src/config/future-version-guard.ts

export type FutureConfigActionBlock = unknown;
export function resolveFutureConfigActionBlock(...args: any[]): any {
  return undefined;
}
export function formatFutureConfigActionBlock(...args: any[]): any {
  return "";
}
export const ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV: any = undefined as any;
