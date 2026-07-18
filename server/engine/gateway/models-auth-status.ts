// 移植自 openclaw/src/gateway/server-methods/models-auth-status.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ModelAuthExpiry = unknown;

export type ModelAuthStatusProfile = unknown;

export type ModelAuthStatusProvider = unknown;

export type ModelAuthStatusResult = unknown;

export type ModelAuthLogoutResult = unknown;

export function invalidateModelAuthStatusCache(...args: unknown[]): unknown {
  throw new Error("not implemented: invalidateModelAuthStatusCache");
}

export function aggregateOAuthStatus(...args: unknown[]): unknown {
  throw new Error("not implemented: aggregateOAuthStatus");
}

export const modelsAuthStatusHandlers: unknown = undefined;
