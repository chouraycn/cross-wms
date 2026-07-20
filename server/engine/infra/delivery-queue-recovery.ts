// 移植自 openclaw/src/infra/delivery-queue-recovery.ts

export type RecoverySummary = unknown;
export type DeliverFn = unknown;
export type ActiveDeliveryClaimResult = unknown;
export interface RecoveryLogger {}
export interface PendingDeliveryDrainDecision {}
export function withActiveDeliveryClaim(...args: unknown[]): unknown {
  return undefined;
}
export function isEntryEligibleForRecoveryRetry(...args: unknown[]): unknown {
  return false;
}
export function isPermanentDeliveryError(...args: unknown[]): unknown {
  return false;
}
export function drainPendingDeliveries(...args: unknown[]): unknown {
  return undefined;
}
export function recoverPendingDeliveries(...args: unknown[]): unknown {
  return undefined;
}
export type computeBackoffMs = unknown;
export type MAX_RETRIES = unknown;
