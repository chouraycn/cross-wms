// 移植自 openclaw/src/gateway/server/ws-connection.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type GatewayWsSharedHandlerParams = unknown;

export type AttachGatewayWsConnectionHandlerParams = unknown;

export function attachGatewayWsConnectionHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: attachGatewayWsConnectionHandler");
}
