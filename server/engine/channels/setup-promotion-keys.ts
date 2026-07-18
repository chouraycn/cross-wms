// 移植自 openclaw/src/channels/plugins/setup-promotion-keys.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function isCommonSingleAccountPromotionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: isCommonSingleAccountPromotionKey");
}

export function isSetupSingleAccountPromotionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: isSetupSingleAccountPromotionKey");
}

export function collectSingleAccountPromotionEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: collectSingleAccountPromotionEntries");
}
