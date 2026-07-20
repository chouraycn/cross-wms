// 移植自 openclaw/src/infra/undici-runtime.ts

export type UndiciRuntimeDeps = unknown;
export type UndiciGlobalDispatcherDeps = unknown;
export function loadUndiciRuntimeDeps(...args: unknown[]): unknown {
  return undefined;
}
export function loadUndiciGlobalDispatcherDeps(...args: unknown[]): unknown {
  return undefined;
}
export function createHttp1Agent(...args: unknown[]): unknown {
  return undefined;
}
export function createHttp1EnvHttpProxyAgent(...args: unknown[]): unknown {
  return undefined;
}
export function createHttp1ProxyAgent(...args: unknown[]): unknown {
  return undefined;
}
export const TEST_UNDICI_RUNTIME_DEPS_KEY: unknown = undefined;
