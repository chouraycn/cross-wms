// 移植自 openclaw/src/infra/message.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type MessageGatewayOptions = unknown;
export type MessageSendResult = unknown;
export type MessagePollResult = unknown;
export function sendMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: sendMessage");
}
export function sendPoll(...args: unknown[]): unknown {
  throw new Error("not implemented: sendPoll");
}
