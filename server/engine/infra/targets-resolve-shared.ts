// 移植自 openclaw/src/infra/targets-resolve-shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundTargetResolution = unknown;
export type ResolveOutboundTargetParams = unknown;
export function resolveOutboundTargetWithPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundTargetWithPlugin");
}
