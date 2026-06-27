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
