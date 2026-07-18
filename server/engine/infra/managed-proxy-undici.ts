// 移植自 openclaw/src/infra/managed-proxy-undici.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveActiveManagedProxyTlsOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveActiveManagedProxyTlsOptions");
}
export function addActiveManagedProxyTlsOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: addActiveManagedProxyTlsOptions");
}
export function resolveManagedEnvHttpProxyAgentOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManagedEnvHttpProxyAgentOptions");
}
