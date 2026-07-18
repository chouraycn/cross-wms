// 移植自 openclaw/src/infra/target-id-resolution.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ResolvedIdLikeTarget = unknown;
export function maybeResolveIdLikeTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: maybeResolveIdLikeTarget");
}
