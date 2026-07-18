// 移植自 openclaw/src/config/store-load.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type LoadSessionStoreOptions = unknown;
export type ReadSessionEntryOptions = unknown;
export function normalizeSessionStore(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeSessionStore");
}
export function loadSessionStore(...args: unknown[]): unknown {
  throw new Error("not implemented: loadSessionStore");
}
export function readSessionStoreSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: readSessionStoreSnapshot");
}
export function readSessionEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: readSessionEntry");
}
export function readSessionEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: readSessionEntries");
}
