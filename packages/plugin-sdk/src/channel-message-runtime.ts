// 通道消息运行时：消息生命周期契约与运行时发送辅助。
// @deprecated openclaw 原始实现从 ./channel-outbound.js 与 ./inbound-reply-dispatch.js 重导出，
// 依赖未移植模块。此处提供最小可用类型与桩函数，建议使用 channel-outbound 与 channel-inbound。

export type {
  DurableInboundReplyDeliveryOptions,
  DurableInboundReplyDeliveryParams,
  DurableInboundReplyDeliveryResult,
  DurableMessageBatchSendParams,
  DurableMessageBatchSendResult,
  DurableMessageSendContext,
  DurableMessageSendContextParams,
  DurableMessageSendIntent,
  DurableMessageSendState,
  DurableMessageStateRecord,
  LiveMessagePhase,
  LiveMessageState,
  LivePreviewFinalizerResult,
  LivePreviewFinalizerResultKind,
  MessageAckPolicy,
  MessageAckStage,
  MessageAckState,
  MessageDurabilityPolicy,
  MessageReceipt,
  MessageReceiptPart,
  MessageReceiptPartKind,
  MessageReceiptSourceResult,
  MessageReceiveContext,
  MessageSendContext,
  RenderedMessageBatch,
  RenderedMessageBatchPlan,
  RenderedMessageBatchPlanItem,
  RenderedMessageBatchPlanKind,
  FinalizableLivePreviewAdapter,
  ChannelMessageAdapter,
  CreateChannelReplyPipelineParams,
} from "./channel-outbound";

export {
  createChannelMessageReplyPipeline,
  deliverInboundReplyWithMessageSendContext,
  sendDurableMessageBatch,
  withDurableMessageSendContext,
} from "./channel-outbound";

/** 入站回复分发基础。 */
export type InboundReplyDispatchBase = {
  text: string;
  replyToMessageId?: string;
};

/** @deprecated 使用 channel-inbound 的 buildInboundReplyDispatchBase。 */
// TODO: 依赖模块未移植，暂用本地桩
export function buildChannelMessageReplyDispatchBase(input: {
  text: string;
  replyToMessageId?: string;
}): InboundReplyDispatchBase {
  return input;
}

/** @deprecated 使用 channel-inbound 的 dispatchChannelInboundReply。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function dispatchChannelMessageReplyWithBase(
  _base: InboundReplyDispatchBase,
): Promise<{ dispatched: boolean; messageId?: string }> {
  return { dispatched: false };
}

/** @deprecated 仅在遗留兼容路径使用 recordChannelMessageReplyDispatch。 */
// TODO: 依赖模块未移植，暂用本地桩
export function recordChannelMessageReplyDispatch(_input: unknown): void {}

/** @deprecated 使用 channel-inbound 的 hasFinalInboundReplyDispatch。 */
// TODO: 依赖模块未移植，暂用本地桩
export function hasFinalChannelMessageReplyDispatch(_result: unknown): boolean {
  return false;
}

/** @deprecated 使用 channel-inbound 的 hasVisibleInboundReplyDispatch。 */
// TODO: 依赖模块未移植，暂用本地桩
export function hasVisibleChannelMessageReplyDispatch(_result: unknown): boolean {
  return false;
}

/** @deprecated 使用 channel-inbound 的 resolveInboundReplyDispatchCounts。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelMessageReplyDispatchCounts(_input: unknown): { final: number; visible: number } {
  return { final: 0, visible: 0 };
}

/** @deprecated 使用 channel-outbound 的 createChannelMessageReplyPipeline。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelTurnReplyPipeline(_input?: unknown): unknown {
  return {};
}

/** @deprecated 使用 channel-outbound 的 deliverInboundReplyWithMessageSendContext。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function deliverDurableInboundReplyPayload(_input?: unknown): Promise<{ delivered: boolean }> {
  return { delivered: false };
}
