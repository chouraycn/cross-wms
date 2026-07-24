// 移植自 openclaw/src/gateway/server-methods/models-auth-status.ts

export type ModelAuthExpiry = unknown;

export type ModelAuthStatusProfile = unknown;

export type ModelAuthStatusProvider = unknown;

export type ModelAuthStatusResult = unknown;

export type ModelAuthLogoutResult = unknown;

export function invalidateModelAuthStatusCache(...args: unknown[]): unknown {
  return undefined;
}

export function aggregateOAuthStatus(...args: unknown[]): unknown {
  return undefined;
}

export const modelsAuthStatusHandlers: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
