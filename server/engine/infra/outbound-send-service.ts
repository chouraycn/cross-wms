// 移植自 openclaw/src/infra/outbound-send-service.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundGatewayContext = unknown;
export type OutboundSendContext = unknown;
export function executeSendAction(...args: unknown[]): unknown {
  throw new Error("not implemented: executeSendAction");
}
export function executePollAction(...args: unknown[]): unknown {
  throw new Error("not implemented: executePollAction");
}
