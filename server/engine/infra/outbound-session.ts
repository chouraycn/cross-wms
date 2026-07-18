// 移植自 openclaw/src/infra/outbound-session.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundSessionRoute = unknown;
export type ResolveOutboundSessionRouteParams = unknown;
export function resolveOutboundSessionRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundSessionRoute");
}
export function ensureOutboundSessionEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureOutboundSessionEntry");
}
