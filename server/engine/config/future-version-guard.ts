// 移植自 openclaw/src/config/future-version-guard.ts

export type FutureConfigActionBlock = unknown;
export function resolveFutureConfigActionBlock(...args: unknown[]): unknown {
  return undefined;
}
export function formatFutureConfigActionBlock(...args: unknown[]): unknown {
  return "";
}
export const ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV: unknown = undefined as unknown;
