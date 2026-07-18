// 移植自 openclaw/src/infra/delivery-queue-storage.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type QueuedRenderedMessageBatchPlan = unknown;
export type QueuedReplyPayloadSendingHook = unknown;
export type QueuedDeliveryPayload = unknown;
export interface QueuedDelivery {}
export function enqueueDelivery(...args: unknown[]): unknown {
  throw new Error("not implemented: enqueueDelivery");
}
export function ackDelivery(...args: unknown[]): unknown {
  throw new Error("not implemented: ackDelivery");
}
export function failDelivery(...args: unknown[]): unknown {
  throw new Error("not implemented: failDelivery");
}
export function markDeliveryPlatformSendAttemptStarted(...args: unknown[]): unknown {
  throw new Error("not implemented: markDeliveryPlatformSendAttemptStarted");
}
export function markDeliveryPlatformOutcomeUnknown(...args: unknown[]): unknown {
  throw new Error("not implemented: markDeliveryPlatformOutcomeUnknown");
}
export function loadPendingDelivery(...args: unknown[]): unknown {
  throw new Error("not implemented: loadPendingDelivery");
}
export function loadPendingDeliveries(...args: unknown[]): unknown {
  throw new Error("not implemented: loadPendingDeliveries");
}
export function moveToFailed(...args: unknown[]): unknown {
  throw new Error("not implemented: moveToFailed");
}
