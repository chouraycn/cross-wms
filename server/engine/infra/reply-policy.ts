// 移植自 openclaw/src/infra/reply-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ReplyToOverride = unknown;
export type ReplyToResolution = unknown;
export function createReplyToFanout(...args: unknown[]): unknown {
  throw new Error("not implemented: createReplyToFanout");
}
export function createReplyToDeliveryPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: createReplyToDeliveryPolicy");
}
