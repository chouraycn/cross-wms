// 移植自 openclaw/src/gateway/server/plugins-http/route-auth.ts

export function matchedPluginRoutesRequireGatewayAuth(...args: any[]): any {
  return undefined;
}

export function shouldEnforceGatewayAuthForPluginPath(...args: any[]): any {
  return false;
}
