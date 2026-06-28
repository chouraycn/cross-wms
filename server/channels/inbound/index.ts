/**
 * Inbound pipeline system.
 *
 * A message inbound pipeline that handles processing of events from external platforms,
 * including event classification, access control, and agent dispatching.
 *
 * @example
 * ```typescript
 * import { SqliteInboundQueue, InboundEventHandler, InboundPipeline } from './channels/inbound';
 *
 * const queue = new SqliteInboundQueue('./data/inbound.db');
 * const handler = new InboundEventHandler({ registry, accessControl, agentDispatcher });
 * const pipeline = new InboundPipeline({ queue, handler });
 *
 * pipeline.start();
 *
 * // Push events from external platforms
 * await pipeline.push({
 *   kind: 'message',
 *   channelId: 'slack',
 *   accountId: 'account-1',
 *   messageId: 'msg-123',
 *   timestamp: Date.now(),
 *   payload: { body: 'Hello!', rawBody: 'Hello!', from: 'user-1', to: 'channel-1' }
 * });
 *
 * // Graceful shutdown
 * await pipeline.stop();
 * queue.close();
 * ```
 */

// Types
export type {
  InboundEventKind,
  InboundEvent,
  MessagePayload,
  ReactionPayload,
  TypingPayload,
  EditedPayload,
  DeletedPayload,
  PresencePayload,
  ErrorPayload,
  InboundMedia,
  InboundEventHandler as InboundEventHandlerType,
  InboundDecision,
  HandleResult,
  ChannelRegistry,
  ChannelInfo,
  AccountInfo,
  ChannelCapabilities,
  AccessControl,
  AccessDecision,
  AgentDispatcher,
  DispatchResult,
  InboundQueue,
} from "./types.js";

// Queue implementations
export { SqliteInboundQueue, InMemoryInboundQueue } from "./queue.js";

// Handler
export { InboundEventHandler } from "./handler.js";
export type { InboundEventHandlerConfig } from "./handler.js";

// Pipeline
export { InboundPipeline } from "./pipeline.js";
export type { InboundPipelineConfig, PipelineState } from "./pipeline.js";
