// 移植自 openclaw/src/infra/session-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundSessionContext = unknown;
export function buildOutboundSessionContext(...args: unknown[]): unknown {
  throw new Error("not implemented: buildOutboundSessionContext");
}
