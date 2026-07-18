// 移植自 openclaw/src/infra/send-deps.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundSendDeps = unknown;
export type ResolveOutboundSendDepOptions = unknown;
export function resolveLegacyOutboundSendDepKeys(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveLegacyOutboundSendDepKeys");
}
export function resolveOutboundSendDep(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundSendDep");
}
