/**
 * Reply Module Index
 * Reply 模块入口
 */

// Types
export type {
  ReplyPayload,
  ReplyPayloadMetadata,
  ReplyDispatchKind,
  ReplyDispatchRuntimeInfo,
  ReplyDispatchOptions,
  ReplyDispatcher,
  ReplyCoalescedUpdate,
  ReplyCoalescerFlushHandler,
  BlockBreakPreference,
  BlockStreamingChunkingConfig,
  BlockStreamingCoalescingConfig,
  BlockReplyEventType,
  BlockReplyTextEvent,
  BlockReplyToolEvent,
  BlockReplyFinalEvent,
  ReasoningEvent,
  BlockReplyEvent,
  BlockReplyEventHandler,
  FenceSpan,
  FenceScanState,
} from "./types.js";

// Reply Dispatcher
export {
  getReplyDispatcher,
  registerReplyDispatcher,
  unregisterReplyDispatcher,
  dispatchReply,
  resetReplyDispatcherForTests,
} from "./replyDispatcher.js";
export type { ReplyDispatcherManager } from "./replyDispatcher.js";

// Reply Coalescer
export { ReplyCoalescer, DualCoalescer } from "./replyCoalescer.js";
export type { CoalescerPriority, CoalescerOptions } from "./replyCoalescer.js";

// Directive Processor
export {
  getDirectiveProcessor,
  registerDirectiveHandler,
  processDirectives,
  stripDirectives,
  resetDirectiveProcessorForTests,
} from "./directiveProcessor.js";
export type {
  DirectiveType,
  ParsedDirective,
  DirectiveHandler,
  DirectiveContext,
  DirectiveResult,
  DirectiveProcessor,
} from "./directiveProcessor.js";

// Foreground Reply Fence
export {
  ForegroundReplyFence,
  getForegroundReplyFence,
  resetForegroundReplyFenceForTests,
} from "./foregroundReplyFence.js";
export type { ForegroundReplyFenceManager } from "./foregroundReplyFence.js";

// Markdown Aware Chunker
export {
  MarkdownAwareChunker,
  scanFenceSpans,
  parseFenceSpans,
  findFenceSpanAt,
  isSafeFenceBreak,
  stripReasoningTagsFromText,
} from "./markdownAwareChunker.js";

// Block Streaming
export {
  BlockStreamingPipeline,
  createBlockStreamingPipeline,
  resolveEffectiveBlockStreamingConfig,
} from "./blockStreaming.js";
