// 移植自 openclaw/src/config/plugin-host-cleanup.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginHostSessionCleanupMode = unknown;
export type PluginHostSessionCleanupStoreParams = unknown;
export function clearPluginOwnedSessionState(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginOwnedSessionState");
}
export function cleanupPluginHostSessionStore(...args: unknown[]): unknown {
  throw new Error("not implemented: cleanupPluginHostSessionStore");
}
