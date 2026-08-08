// 移植自 openclaw/src/infra/delivery-queue-recovery.ts

export type RecoverySummary = unknown;
export type DeliverFn = unknown;
export type ActiveDeliveryClaimResult = unknown;
export interface RecoveryLogger {}
export interface PendingDeliveryDrainDecision {}
export function withActiveDeliveryClaim(...args: any[]): any {
  return undefined;
}
export function isEntryEligibleForRecoveryRetry(...args: any[]): any {
  return false;
}
export function isPermanentDeliveryError(...args: any[]): any {
  return false;
}
export function drainPendingDeliveries(...args: any[]): any {
  return undefined;
}
export function recoverPendingDeliveries(...args: any[]): any {
  return undefined;
}
export type computeBackoffMs = unknown;
export type MAX_RETRIES = unknown;
