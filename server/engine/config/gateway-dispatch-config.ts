// 移植自 openclaw/src/config/gateway-dispatch-config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function readGatewayDispatchConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: readGatewayDispatchConfig");
}
export function readGatewayDispatchConfigWithShellEnvFallback(...args: unknown[]): unknown {
  throw new Error("not implemented: readGatewayDispatchConfigWithShellEnvFallback");
}
