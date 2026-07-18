// 移植自 openclaw/src/gateway/server/ws-connection/message-handler.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type WsOriginCheckMetrics = unknown;

export type GatewayWsMessageHandlerParams = unknown;

export function attachGatewayWsMessageHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: attachGatewayWsMessageHandler");
}

export const testing_message_handler: unknown = undefined;

export const __testing: unknown = undefined;
