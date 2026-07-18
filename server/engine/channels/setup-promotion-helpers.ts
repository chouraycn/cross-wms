// 移植自 openclaw/src/channels/plugins/setup-promotion-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveSingleAccountKeysToMove(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveSingleAccountKeysToMove");
}

export function resolveSingleAccountPromotionTarget(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveSingleAccountPromotionTarget");
}
