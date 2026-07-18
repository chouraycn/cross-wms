// 公共会话投递队列 facade：storage 与 recovery 位于拆分模块，
// 调用方从这里导入稳定的聚合 API。
export {
  ackSessionDelivery,
  enqueueSessionDelivery,
  failSessionDelivery,
  loadPendingSessionDelivery,
  loadPendingSessionDeliveries,
} from "./session-delivery-queue-storage.js";
export type {
  QueuedSessionDelivery,
  QueuedSessionDeliveryPayload,
  SessionDeliveryRoute,
} from "./session-delivery-queue-storage.js";
export {
  drainPendingSessionDeliveries,
  isSessionDeliveryEligibleForRetry,
  recoverPendingSessionDeliveries,
} from "./session-delivery-queue-recovery.js";
export type { SessionDeliveryRecoveryLogger } from "./session-delivery-queue-recovery.js";
