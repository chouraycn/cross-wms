// 移植自 openclaw/src/gateway/server/plugins-http/route-auth.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function matchedPluginRoutesRequireGatewayAuth(...args: unknown[]): unknown {
  throw new Error("not implemented: matchedPluginRoutesRequireGatewayAuth");
}

export function shouldEnforceGatewayAuthForPluginPath(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldEnforceGatewayAuthForPluginPath");
}
