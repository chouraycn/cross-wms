// 移植自 openclaw/src/infra/proxy-tls.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ManagedProxyTlsOptions = unknown;
export function resolveManagedProxyCaFile(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManagedProxyCaFile");
}
export function resolveManagedProxyCaFileForUrl(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManagedProxyCaFileForUrl");
}
export function loadManagedProxyTlsOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: loadManagedProxyTlsOptions");
}
export function loadManagedProxyTlsOptionsSync(...args: unknown[]): unknown {
  throw new Error("not implemented: loadManagedProxyTlsOptionsSync");
}
