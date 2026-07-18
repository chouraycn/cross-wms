// 移植自 openclaw/src/infra/delivery-queue-recovery.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type RecoverySummary = unknown;
export type DeliverFn = unknown;
export type ActiveDeliveryClaimResult = unknown;
export interface RecoveryLogger {}
export interface PendingDeliveryDrainDecision {}
export function withActiveDeliveryClaim(...args: unknown[]): unknown {
  throw new Error("not implemented: withActiveDeliveryClaim");
}
export function isEntryEligibleForRecoveryRetry(...args: unknown[]): unknown {
  throw new Error("not implemented: isEntryEligibleForRecoveryRetry");
}
export function isPermanentDeliveryError(...args: unknown[]): unknown {
  throw new Error("not implemented: isPermanentDeliveryError");
}
export function drainPendingDeliveries(...args: unknown[]): unknown {
  throw new Error("not implemented: drainPendingDeliveries");
}
export function recoverPendingDeliveries(...args: unknown[]): unknown {
  throw new Error("not implemented: recoverPendingDeliveries");
}
export type computeBackoffMs = unknown;
export type MAX_RETRIES = unknown;
