// 移植自 openclaw/src/infra/target-normalization.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type TargetResolveKindLike = unknown;
export type ResolvedPluginMessagingTarget = unknown;
export function normalizeChannelTargetInput(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeChannelTargetInput");
}
export function normalizeTargetForProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeTargetForProvider");
}
export function resolveNormalizedTargetInput(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNormalizedTargetInput");
}
export function looksLikeTargetId(...args: unknown[]): unknown {
  throw new Error("not implemented: looksLikeTargetId");
}
export function maybeResolvePluginMessagingTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: maybeResolvePluginMessagingTarget");
}
export function buildTargetResolverSignature(...args: unknown[]): unknown {
  throw new Error("not implemented: buildTargetResolverSignature");
}
export const testing_target_normalization: unknown = undefined;
export type __testing_target_normalization = unknown;
