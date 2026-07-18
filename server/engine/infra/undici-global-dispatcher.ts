// 移植自 openclaw/src/infra/undici-global-dispatcher.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function ensureGlobalUndiciEnvProxyDispatcher(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureGlobalUndiciEnvProxyDispatcher");
}
export function ensureGlobalUndiciStreamTimeouts(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureGlobalUndiciStreamTimeouts");
}
export function ensureGlobalUndiciDispatcherStreamTimeouts(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureGlobalUndiciDispatcherStreamTimeouts");
}
export function resetGlobalUndiciStreamTimeoutsForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: resetGlobalUndiciStreamTimeoutsForTests");
}
export function forceResetGlobalDispatcher(...args: unknown[]): unknown {
  throw new Error("not implemented: forceResetGlobalDispatcher");
}
export const DEFAULT_UNDICI_STREAM_TIMEOUT_MS: unknown = undefined;
export const globalUndiciStreamTimeoutMs: unknown = undefined;
