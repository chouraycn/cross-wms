// 移植自 openclaw/src/infra/channel-target.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function applyTargetToParams(...args: unknown[]): unknown {
  throw new Error("not implemented: applyTargetToParams");
}
export const hasNonEmptyString: unknown = undefined;
export const CHANNEL_TARGET_DESCRIPTION: unknown = undefined;
export const CHANNEL_TARGETS_DESCRIPTION: unknown = undefined;
