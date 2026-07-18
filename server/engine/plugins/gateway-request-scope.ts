// 移植自 openclaw/src/plugins/gateway-request-scope.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginRuntimeGatewayRequestScope = unknown;
export type PluginRuntimePluginScope = unknown;
export function withPluginRuntimeGatewayRequestScope(...args: unknown[]): unknown {
  throw new Error("not implemented: withPluginRuntimeGatewayRequestScope");
}
export function withPluginRuntimePluginScope(...args: unknown[]): unknown {
  throw new Error("not implemented: withPluginRuntimePluginScope");
}
export function withPluginRuntimePluginIdScope(...args: unknown[]): unknown {
  throw new Error("not implemented: withPluginRuntimePluginIdScope");
}
export function getPluginRuntimeGatewayRequestScope(...args: unknown[]): unknown {
  throw new Error("not implemented: getPluginRuntimeGatewayRequestScope");
}
