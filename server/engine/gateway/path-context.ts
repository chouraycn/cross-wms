// 移植自 openclaw/src/gateway/server/plugins-http/path-context.ts

export type PluginRoutePathContext = unknown;

export function prefixMatchPath(...args: any[]): any {
  return undefined;
}

export function isProtectedPluginRoutePathFromContext(...args: any[]): any {
  return false;
}

export function resolvePluginRoutePathContext(...args: any[]): any {
  return undefined;
}
