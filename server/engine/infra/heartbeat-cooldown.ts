// 移植自 openclaw/src/infra/heartbeat-cooldown.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type DeferDecision = unknown;
export type ShouldDeferInput = unknown;
export function shouldDeferWake(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldDeferWake");
}
export function recordRunStart(...args: unknown[]): unknown {
  throw new Error("not implemented: recordRunStart");
}
export const DEFAULT_MIN_WAKE_SPACING_MS: unknown = undefined;
export const DEFAULT_FLOOD_WINDOW_MS: unknown = undefined;
export const DEFAULT_FLOOD_THRESHOLD: unknown = undefined;
