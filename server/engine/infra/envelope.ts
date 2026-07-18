// 移植自 openclaw/src/infra/envelope.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundResultEnvelope = unknown;
export function buildOutboundResultEnvelope(...args: unknown[]): unknown {
  throw new Error("not implemented: buildOutboundResultEnvelope");
}
