// 移植自 openclaw/src/gateway/server/plugins-http/route-match.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function doesPluginRouteMatchPath(...args: unknown[]): unknown {
  throw new Error("not implemented: doesPluginRouteMatchPath");
}

export function findMatchingPluginHttpRoutes(...args: unknown[]): unknown {
  throw new Error("not implemented: findMatchingPluginHttpRoutes");
}

export function findRegisteredPluginHttpRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: findRegisteredPluginHttpRoute");
}

export function isRegisteredPluginHttpRoutePath(...args: unknown[]): unknown {
  throw new Error("not implemented: isRegisteredPluginHttpRoutePath");
}
