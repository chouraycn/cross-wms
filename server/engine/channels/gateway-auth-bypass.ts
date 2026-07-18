// 移植自 openclaw/src/channels/plugins/gateway-auth-bypass.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveBundledChannelGatewayAuthBypassPaths(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledChannelGatewayAuthBypassPaths");
}
