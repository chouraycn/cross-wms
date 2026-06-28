/**
 * Inbound event types.
 *
 * Defines the core types for the message inbound pipeline system.
 */
import type { ChannelId, AccountId } from "../types.js";

// ============================================================================
// Inbound Event Kinds
// ============================================================================

/**
 * Classification of inbound events from external platforms.
 */
export type InboundEventKind =
  | "message"
  | "reaction"
  | "typing"
  | "edited"
  | "deleted"
  | "presence"
  | "error";

// ============================================================================
// Inbound Event
// ============================================================================

/**
 * Base inbound event structure.
 * All inbound events from external platforms are wrapped in this interface.
 */
export interface InboundEvent<T = unknown> {
  kind: InboundEventKind;
  channelId: ChannelId;
  accountId: AccountId;
  messageId: string;
  timestamp: number;
  payload: T;
}

/**
 * Specific inbound event payloads by kind.
 */
export interface MessagePayload {
  body: string;
  rawBody: string;
  from: string;
  to: string;
  replyToId?: string;
  media?: InboundMedia[];
}

export interface ReactionPayload {
  messageId: string;
  userId: string;
  emoji: string;
  added: boolean;
}

export interface TypingPayload {
  userId: string;
  isTyping: boolean;
}

export interface EditedPayload {
  messageId: string;
  newBody: string;
  editedAt: number;
}

export interface DeletedPayload {
  messageId: string;
  deletedAt: number;
}

export interface PresencePayload {
  userId: string;
  status: "online" | "offline" | "away";
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Inbound media attachment.
 */
export interface InboundMedia {
  type: string;
  url?: string;
  content?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

// ============================================================================
// Inbound Event Handler
// ============================================================================

/**
 * Handler function type for processing inbound events.
 */
export type InboundEventHandler = (event: InboundEvent) => Promise<void>;

// ============================================================================
// Inbound Decision
// ============================================================================

/**
 * Decision made by the handler after processing an inbound event.
 */
export interface InboundDecision {
  action: "dispatch" | "drop" | "error";
  reason?: string;
  agentId?: string;
}

// ============================================================================
// Handle Result
// ============================================================================

/**
 * Result of handling an inbound event.
 */
export interface HandleResult {
  success: boolean;
  dispatched?: boolean;
  error?: Error;
  decision?: InboundDecision;
}

// ============================================================================
// Channel Registry Interface
// ============================================================================

/**
 * Interface for channel registry operations.
 * The registry is responsible for looking up channel configurations.
 */
export interface ChannelRegistry {
  getChannel(channelId: ChannelId): ChannelInfo | null;
  getAccount(channelId: ChannelId, accountId: AccountId): AccountInfo | null;
  listChannels(): ChannelId[];
}

export interface ChannelInfo {
  id: ChannelId;
  label: string;
  capabilities: ChannelCapabilities;
}

export interface AccountInfo {
  id: AccountId;
  channelId: ChannelId;
  isEnabled: boolean;
}

export interface ChannelCapabilities {
  chatTypes?: ("direct" | "group")[];
  media?: boolean;
  reactions?: boolean;
  threads?: boolean;
  polls?: boolean;
  mentions?: boolean;
  voice?: boolean;
  video?: boolean;
  typing?: boolean;
}

// ============================================================================
// Access Control Interface
// ============================================================================

/**
 * Interface for access control operations.
 * Determines whether a user has permission to interact with the bot.
 */
export interface AccessControl {
  /**
   * Check if a user is allowed to send messages in a channel.
   */
  canSendMessage(params: {
    channelId: ChannelId;
    accountId: AccountId;
    userId: string;
    conversationId: string;
  }): Promise<AccessDecision>;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Agent Dispatcher Interface
// ============================================================================

/**
 * Interface for agent dispatching.
 * Responsible for routing events to the appropriate agent for processing.
 */
export interface AgentDispatcher {
  /**
   * Dispatch an inbound event to the appropriate agent.
   */
  dispatch(params: {
    event: InboundEvent;
    agentId?: string;
  }): Promise<DispatchResult>;
}

export interface DispatchResult {
  dispatched: boolean;
  runId?: string;
  error?: Error;
}

// ============================================================================
// Inbound Queue Interface
// ============================================================================

/**
 * Interface for the inbound event queue.
 * Provides FIFO semantics for inbound event processing.
 */
export interface InboundQueue {
  /**
   * Enqueue an inbound event.
   */
  enqueue(event: InboundEvent): Promise<void>;

  /**
   * Dequeue the next inbound event.
   * Returns null if the queue is empty.
   */
  dequeue(): Promise<InboundEvent | null>;

  /**
   * Get the current queue size.
   */
  size(): Promise<number>;

  /**
   * Clear all events from the queue.
   */
  clear(): Promise<void>;
}
