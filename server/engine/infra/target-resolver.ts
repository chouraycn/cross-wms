// 移植自 openclaw/src/infra/target-resolver.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type TargetResolveKind = unknown;
export type ResolveAmbiguousMode = unknown;
export type ResolvedMessagingTarget = unknown;
export type ResolveMessagingTargetResult = unknown;
export function resolveChannelTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelTarget");
}
export function resetDirectoryCache(...args: unknown[]): unknown {
  throw new Error("not implemented: resetDirectoryCache");
}
export function formatTargetDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: formatTargetDisplay");
}
export function resolveMessagingTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMessagingTarget");
}
export function lookupDirectoryDisplay(...args: unknown[]): unknown {
  throw new Error("not implemented: lookupDirectoryDisplay");
}
export type maybeResolveIdLikeTarget = unknown;
export const maybeResolveIdLikeTarget: unknown = undefined;
