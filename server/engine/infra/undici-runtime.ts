// 移植自 openclaw/src/infra/undici-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type UndiciRuntimeDeps = unknown;
export type UndiciGlobalDispatcherDeps = unknown;
export function loadUndiciRuntimeDeps(...args: unknown[]): unknown {
  throw new Error("not implemented: loadUndiciRuntimeDeps");
}
export function loadUndiciGlobalDispatcherDeps(...args: unknown[]): unknown {
  throw new Error("not implemented: loadUndiciGlobalDispatcherDeps");
}
export function createHttp1Agent(...args: unknown[]): unknown {
  throw new Error("not implemented: createHttp1Agent");
}
export function createHttp1EnvHttpProxyAgent(...args: unknown[]): unknown {
  throw new Error("not implemented: createHttp1EnvHttpProxyAgent");
}
export function createHttp1ProxyAgent(...args: unknown[]): unknown {
  throw new Error("not implemented: createHttp1ProxyAgent");
}
export const TEST_UNDICI_RUNTIME_DEPS_KEY: unknown = undefined;
