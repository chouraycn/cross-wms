// 移植自 openclaw/src/infra/reply-payload-normalize.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundReplyPayload = unknown;
export function normalizeOutboundReplyPayload(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeOutboundReplyPayload");
}
