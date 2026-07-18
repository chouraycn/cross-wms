// 移植自 openclaw/src/gateway/server/plugins-http/path-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginRoutePathContext = unknown;

export function prefixMatchPath(...args: unknown[]): unknown {
  throw new Error("not implemented: prefixMatchPath");
}

export function isProtectedPluginRoutePathFromContext(...args: unknown[]): unknown {
  throw new Error("not implemented: isProtectedPluginRoutePathFromContext");
}

export function resolvePluginRoutePathContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginRoutePathContext");
}
