/**
 * Outbound module barrel export.
 */
export type {
  MessageReceipt,
  MessageReceiptPart,
  DurableMessageBatchSendResult,
  DurableMessageBatchSendResultStatus,
  DurableMessagePartResult,
  MessageSendSuppressionReason,
  MessageSendFailureStage,
} from "./result.js";

export type {
  DurableMessageSendContext,
  DurableMessageSendContextParams,
  DurableMessageSendIntent,
} from "./context.js";

export type {
  DeliveryStrategy,
  DeliveryOptions,
  OutboundDeliverer,
  OutboundDelivererParams,
  DeliveryIntent,
  DeliveryCommitment,
  DeliveryCommitmentState,
} from "./deliver.js";

export type {
  OutboundPipelineSendParams,
  ChannelRegistry,
} from "./pipeline.js";

export {
  OutboundPipeline,
  createOutboundPipeline,
} from "./pipeline.js";

export { MessageLifecycleManager, messageLifecycleManager } from "./lifecycle-manager.js";
export type {
  MessageLifecyclePhase,
  LifecycleTransition,
  MessageLifecycleState,
  LifecycleManagerOptions,
  LifecycleEventHandler,
} from "./lifecycle-manager.js";

export { RetryQueue, retryQueue } from "./retry-queue.js";
export type {
  RetryItem,
  RetryQueueConfig,
  RetryHandler,
  RetryQueueEventHandler,
} from "./retry-queue.js";
