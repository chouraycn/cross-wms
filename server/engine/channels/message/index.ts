export type {
  MessageDirection,
  MessageStatus,
  MessageKind,
  MessagePartKind,
  MessagePart,
  MessageSender,
  MessageAttachment,
  ChannelMessage,
  MessageEnvelope,
  MessageLifecyclePhase,
  MessageLifecycleEvent,
  MessageCapabilities,
} from "./types.js";

export {
  MessageDirectionSchema,
  MessageStatusSchema,
  MessageKindSchema,
  MessagePartKindSchema,
  MessageLifecyclePhaseSchema,
  MessagePartSchema,
  MessageSenderSchema,
  MessageAttachmentSchema,
  ChannelMessageSchema,
  MessageEnvelopeSchema,
  MessageLifecycleEventSchema,
  MessageCapabilitiesSchema,
  validateChannelMessage,
  validateMessagePart,
  validateMessageLifecycleEvent,
} from "./contracts.js";

export {
  onMessageLifecycleEvent,
  emitLifecycleEvent,
  trackMessageLifecycle,
  advanceMessagePhase,
  getMessagePhases,
  getMessageLifecycleState,
  clearMessageLifecycle,
  hasReachedPhase,
  isMessageInTerminalState,
} from "./lifecycle.js";

export type { MessageReceiveOptions } from "./receive.js";
export {
  receiveMessage,
  convertEnvelopeToMessage,
  createInboundMessage,
  clearReceivedMessageCache,
  hasReceivedMessage,
} from "./receive.js";

export type { MessageSendOptions, MessageSendResult } from "./send.js";
export {
  registerSendAdapter,
  unregisterSendAdapter,
  sendMessage,
  createOutboundMessage,
  buildMessageParts,
  sendMessageWithRetry,
} from "./send.js";

export type { MessageAdapter } from "./adapter.js";
export {
  registerMessageAdapter,
  unregisterMessageAdapter,
  getMessageAdapter,
  adaptInboundMessage,
  adaptOutboundMessage,
  adaptMessageParts,
  normalizeMessageContent,
} from "./adapter.js";

export type { ReplyStage, ReplyPipelineContext, ReplyMiddleware } from "./reply-pipeline.js";
export {
  registerReplyMiddleware,
  clearReplyMiddlewares,
  runReplyPipeline,
  abortReplyPipeline,
  addReplyPrefix,
  addReplySuffix,
  addReplyPart,
} from "./reply-pipeline.js";

export type { IngressQueueOptions, QueuedMessage } from "./ingress-queue.js";
export {
  configureIngressQueue,
  setIngressMessageHandler,
  enqueueInboundMessage,
  processQueue,
  getIngressQueueSize,
  getActiveProcessingCount,
  clearIngressQueue,
} from "./ingress-queue.js";

export type {
  DurableReceiveStatus,
  DurableMessageRecord,
  DurableReceiveOptions,
} from "./durable-receive.js";
export {
  receiveDurable,
  getDurableMessage,
  markProcessing,
  acknowledgeDurable,
  negativeAcknowledgeDurable,
  getPendingDurableMessages,
  getDeadLetterMessages,
  reprocessDeadLetter,
  clearDurableStore,
  getDurableStats,
} from "./durable-receive.js";

export type { ReplyDispatchMode, InboundReplyHandler, ReplyDispatchOptions } from "./inbound-reply-dispatch.js";
export {
  registerInboundReplyHandler,
  unregisterInboundReplyHandler,
  dispatchInboundReply,
  hasReplyHandlers,
  getReplyHandlerCount,
} from "./inbound-reply-dispatch.js";

export type { RenderedBatch, RenderBatchOptions } from "./rendered-batch.js";
export {
  createRenderedBatch,
  mergeRenderedBatches,
  splitRenderedBatch,
  renderMessageToBatch,
  addPartToBatch,
  getBatchStats,
} from "./rendered-batch.js";

export type { MessageState } from "./state.js";
export {
  initMessageState,
  getMessageState,
  updateMessageStatus,
  updateMessagePhase,
  incrementAttempt,
  setMessageMetadata,
  getMessageMetadata,
  removeMessageState,
  clearMessageStates,
  listMessageStates,
  isMessageInProgress,
  isMessageFailed,
  isMessageComplete,
} from "./state.js";

export {
  setChannelCapabilities,
  getChannelCapabilities,
  hasCapability,
  mergeCapabilities,
  disableCapabilities,
  enableCapabilities,
  getSupportedFeatures,
  removeChannelCapabilities,
  clearAllCapabilities,
} from "./capabilities.js";
