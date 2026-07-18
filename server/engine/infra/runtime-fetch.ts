// 移植自 openclaw/src/infra/runtime-fetch.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type DispatcherAwareRequestInit = unknown;
export function isMockedFetch(...args: unknown[]): unknown {
  throw new Error("not implemented: isMockedFetch");
}
export function fetchWithRuntimeDispatcher(...args: unknown[]): unknown {
  throw new Error("not implemented: fetchWithRuntimeDispatcher");
}
export function fetchWithRuntimeDispatcherOrMockedGlobal(...args: unknown[]): unknown {
  throw new Error("not implemented: fetchWithRuntimeDispatcherOrMockedGlobal");
}
