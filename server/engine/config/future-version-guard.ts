// 移植自 openclaw/src/config/future-version-guard.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type FutureConfigActionBlock = unknown;
export function resolveFutureConfigActionBlock(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveFutureConfigActionBlock");
}
export function formatFutureConfigActionBlock(...args: unknown[]): unknown {
  throw new Error("not implemented: formatFutureConfigActionBlock");
}
export const ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV: unknown = undefined;
