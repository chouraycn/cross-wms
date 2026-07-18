// 移植自 openclaw/src/infra/identity.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundIdentity = unknown;
export function normalizeOutboundIdentity(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeOutboundIdentity");
}
export function resolveAgentOutboundIdentity(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentOutboundIdentity");
}
