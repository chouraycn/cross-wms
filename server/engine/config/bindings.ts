// 移植自 openclaw/src/config/bindings.ts

export function isRouteBinding(...args: unknown[]): unknown {
  return false;
}
export function listConfiguredBindings(...args: unknown[]): unknown {
  return [];
}
export function listRouteBindings(...args: unknown[]): unknown {
  return [];
}
export function listAcpBindings(...args: unknown[]): unknown {
  return [];
}
