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
