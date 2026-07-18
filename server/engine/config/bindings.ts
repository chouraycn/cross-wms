// 移植自 openclaw/src/config/bindings.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isRouteBinding(...args: unknown[]): unknown {
  throw new Error("not implemented: isRouteBinding");
}
export function listConfiguredBindings(...args: unknown[]): unknown {
  throw new Error("not implemented: listConfiguredBindings");
}
export function listRouteBindings(...args: unknown[]): unknown {
  throw new Error("not implemented: listRouteBindings");
}
export function listAcpBindings(...args: unknown[]): unknown {
  throw new Error("not implemented: listAcpBindings");
}
