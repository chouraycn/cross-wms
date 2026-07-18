// 移植自 openclaw/src/infra/proxy-lifecycle.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ProxyHandle = unknown;
export function resetProxyLifecycleForTests(...args: unknown[]): unknown {
  throw new Error("not implemented: resetProxyLifecycleForTests");
}
export function ensureInheritedManagedProxyRoutingActive(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureInheritedManagedProxyRoutingActive");
}
export function startProxy(...args: unknown[]): unknown {
  throw new Error("not implemented: startProxy");
}
export function stopProxy(...args: unknown[]): unknown {
  throw new Error("not implemented: stopProxy");
}
export function registerManagedProxyGatewayLoopbackBypass(...args: unknown[]): unknown {
  throw new Error("not implemented: registerManagedProxyGatewayLoopbackBypass");
}
export function registerManagedProxyBrowserCdpBypass(...args: unknown[]): unknown {
  throw new Error("not implemented: registerManagedProxyBrowserCdpBypass");
}
