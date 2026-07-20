// 移植自 openclaw/src/gateway/server/plugins-http/route-auth.ts

export function matchedPluginRoutesRequireGatewayAuth(...args: unknown[]): unknown {
  return undefined;
}

export function shouldEnforceGatewayAuthForPluginPath(...args: unknown[]): unknown {
  return false;
}
