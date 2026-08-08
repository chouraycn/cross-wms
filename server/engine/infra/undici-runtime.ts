// 移植自 openclaw/src/infra/undici-runtime.ts

export type UndiciRuntimeDeps = unknown;
export type UndiciGlobalDispatcherDeps = unknown;
export function loadUndiciRuntimeDeps(...args: any[]): any {
  return undefined;
}
export function loadUndiciGlobalDispatcherDeps(...args: any[]): any {
  return undefined;
}
export function createHttp1Agent(...args: any[]): any {
  return undefined;
}
export function createHttp1EnvHttpProxyAgent(...args: any[]): any {
  return undefined;
}
export function createHttp1ProxyAgent(...args: any[]): any {
  return undefined;
}
export const TEST_UNDICI_RUNTIME_DEPS_KEY: any = undefined as any;
