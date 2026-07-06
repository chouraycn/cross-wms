/**
 * Channel message adapter types.
 *
 * Defines message send/receive contexts, batches, and related durability types.
 */
import type { ChannelId, AccountId } from "../types.js";

/** Delivery durability requested by core when a channel sends agent output. */
export type MessageDurability = "required" | "best_effort";

/** Rendered message part kind for multi-part messages. */
export type RenderedMessagePartKind =
  | "text"
  | "media"
  | "voice"
  | "poll"
  | "card"
  | "preview"
  | "unknown";

/** One rendered part of a multi-part message. */
export interface RenderedMessagePart {
  kind: RenderedMessagePartKind;
  content: unknown;
  metadata?: Record<string, any>;
}

/** Rendered payload batch for outbound message sending. */
export interface RenderedMessageBatch<TPayload = unknown> {
  parts: RenderedMessagePart[];
  metadata?: Record<string, any>;
  payloads?: TPayload[];
}

/** Durable send context passed through render, preview, send, edit, commit, and failure steps. */
export interface MessageSendContext<TPayload = unknown, TSendResult = unknown> {
  id: string;
  channel: ChannelId;
  to: string;
  accountId?: AccountId;
  durability: MessageDurability;
  attempt: number;
  signal: AbortSignal;

  render(): Promise<RenderedMessageBatch<TPayload>>;
  previewUpdate(rendered: RenderedMessageBatch<TPayload>): Promise<unknown>;
  send(rendered: RenderedMessageBatch<TPayload>): Promise<TSendResult>;
  edit(receipt: unknown, rendered: RenderedMessageBatch<TPayload>): Promise<unknown>;
  delete(receipt: unknown): Promise<void>;
  commit(receipt: unknown): Promise<void>;
  fail(error: unknown): Promise<void>;
}

/** Receive acknowledgement timing policy for durable inbound message records. */
export type MessageReceiveAckPolicy =
  | "after_receive_record"
  | "after_agent_dispatch"
  | "after_durable_send"
  | "manual";

/** Receive acknowledgement state machine. */
export type MessageReceiveAckState = "pending" | "acked" | "nacked";

/** Mutable state snapshot for live preview/finalization flows. */
export interface LiveMessageState<TPayload = unknown> {
  phase: "idle" | "previewing" | "finalizing" | "finalized" | "cancelled";
  canFinalizeInPlace: boolean;
  receipt?: unknown;
  lastRendered?: RenderedMessageBatch<TPayload>;
}

/** Durable receive context for inbound message handling. */
export interface MessageReceiveContext<TMessage = unknown> {
  id: string;
  channel: ChannelId;
  accountId?: AccountId;
  message: TMessage;
  ackPolicy: MessageReceiveAckPolicy;
  ackState: MessageReceiveAckState;
  receivedAt: number;
  signal: AbortSignal;

  ack(): Promise<void>;
  nack(error: unknown): Promise<void>;
}

/** Adapter methods a message channel can implement for outbound sends. */
export interface ChannelMessageSendAdapter {
  send?(ctx: MessageSendContext): Promise<unknown>;
}

/** Adapter methods a message channel can implement for inbound receives. */
export interface ChannelMessageReceiveAdapter {
  receive?(ctx: MessageReceiveContext): Promise<void>;
}

/** Adapter for live preview and streaming message features. */
export interface ChannelStreamingAdapter {
  blockStreamingCoalesceDefaults?: {
    minChars: number;
    idleMs: number;
  };
}

/** Channel message type for adapter send/receive operations. */
export interface ChannelMessage {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  content: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
  timestamp?: number;
}

/** Result of sending a channel message. */
export interface ChannelMessageSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
