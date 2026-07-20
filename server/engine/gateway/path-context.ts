// 移植自 openclaw/src/gateway/server/plugins-http/path-context.ts

export type PluginRoutePathContext = unknown;

export function prefixMatchPath(...args: unknown[]): unknown {
  return undefined;
}

export function isProtectedPluginRoutePathFromContext(...args: unknown[]): unknown {
  return false;
}

export function resolvePluginRoutePathContext(...args: unknown[]): unknown {
  return undefined;
}
