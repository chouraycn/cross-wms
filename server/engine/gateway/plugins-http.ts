// 移植自 openclaw/src/gateway/server/plugins-http.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const isProtectedPluginRoutePathFromContext: unknown = undefined;

export const resolvePluginRoutePathContext: unknown = undefined;

export type PluginRoutePathContext = unknown;

export const findRegisteredPluginHttpRoute: unknown = undefined;

export const isRegisteredPluginHttpRoutePath: unknown = undefined;

export const shouldEnforceGatewayAuthForPluginPath: unknown = undefined;

export type PluginRouteDispatchContext = unknown;

export type PluginHttpRequestHandler = unknown;

export type PluginHttpUpgradeHandler = unknown;

export function createGatewayPluginRequestHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: createGatewayPluginRequestHandler");
}

export function createGatewayPluginUpgradeHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: createGatewayPluginUpgradeHandler");
}
