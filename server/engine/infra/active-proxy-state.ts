// 移植自 openclaw/src/infra/active-proxy-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ActiveManagedProxyUrl = unknown;
export type ActiveManagedProxyRegistration = unknown;
export function registerActiveManagedProxyUrl(...args: unknown[]): unknown {
  throw new Error("not implemented: registerActiveManagedProxyUrl");
}
export function stopActiveManagedProxyRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: stopActiveManagedProxyRegistration");
}
export function getActiveManagedProxyLoopbackMode(...args: unknown[]): unknown {
  throw new Error("not implemented: getActiveManagedProxyLoopbackMode");
}
export function getActiveManagedProxyUrl(...args: unknown[]): unknown {
  throw new Error("not implemented: getActiveManagedProxyUrl");
}
export function getActiveManagedProxyTlsOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: getActiveManagedProxyTlsOptions");
}
export function resetActiveManagedProxyStateForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: resetActiveManagedProxyStateForTests");
}
