// 移植自 openclaw/src/infra/message-plan.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundMessageSendOverrides = unknown;
export type OutboundMessageUnit = unknown;
export type OutboundMessageChunker = unknown;
export function planOutboundTextMessageUnits(...args: unknown[]): unknown {
  throw new Error("not implemented: planOutboundTextMessageUnits");
}
export function planOutboundMediaMessageUnits(...args: unknown[]): unknown {
  throw new Error("not implemented: planOutboundMediaMessageUnits");
}
