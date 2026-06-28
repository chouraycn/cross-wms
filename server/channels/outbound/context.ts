/**
 * Durable message send context for persistent outbound message delivery.
 *
 * Provides a unified interface for render, preview, send, edit, delete, commit, and fail operations.
 */
import type { ChannelId, AccountId, AppConfig } from "../types.js";
import type { MessageDurability, RenderedMessageBatch, LiveMessageState } from "../message/types.js";
import type { MessageReceipt } from "./result.js";

/**
 * Durable message send context passed through render, preview, send, edit, commit, and failure steps.
 */
export interface DurableMessageSendContext<TPayload = unknown, TSendResult = unknown> {
  /** Unique identifier for this send context. */
  id: string;

  /** Target channel for the message. */
  channel: ChannelId;

  /** Target recipient identifier (e.g., user ID, room ID). */
  to: string;

  /** Optional account ID used for sending. */
  accountId?: AccountId;

  /** Durability policy for the message delivery. */
  durability: "required" | "best_effort";

  /** Current attempt number (for retries). */
  attempt: number;

  /** Abort signal for cancellation. */
  signal: AbortSignal;

  /** Optional intent identifier for tracking. */
  intent?: string;

  /**
   * Renders the message payloads into a batch.
   */
  render(): Promise<RenderedMessageBatch<TPayload>>;

  /**
   * Updates the live message preview state.
   */
  previewUpdate(rendered: RenderedMessageBatch<TPayload>): Promise<LiveMessageState<TPayload>>;

  /**
   * Sends the rendered message batch.
   */
  send(rendered: RenderedMessageBatch<TPayload>): Promise<TSendResult>;

  /**
   * Edits an existing message receipt with new rendered content.
   */
  edit(receipt: MessageReceipt, rendered: RenderedMessageBatch<TPayload>): Promise<MessageReceipt>;

  /**
   * Deletes a previously sent message.
   */
  delete(receipt: MessageReceipt): Promise<void>;

  /**
   * Commits the message receipt after successful sending.
   */
  commit(receipt: MessageReceipt): Promise<void>;

  /**
   * Handles send failure, performing cleanup and error reporting.
   */
  fail(error: Error): Promise<void>;
}

/**
 * Parameters for creating a durable message send context.
 */
export interface DurableMessageSendContextParams<TPayload = unknown> {
  /** Unique identifier for this send context. */
  id: string;

  /** Target channel for the message. */
  channel: ChannelId;

  /** Target recipient identifier. */
  to: string;

  /** Optional account ID used for sending. */
  accountId?: AccountId;

  /** Durability policy for the message delivery. */
  durability?: "required" | "best_effort";

  /** Current attempt number (for retries). */
  attempt?: number;

  /** Abort signal for cancellation. */
  signal?: AbortSignal;

  /** Optional intent identifier for tracking. */
  intent?: string;

  /** Previous receipt for edit operations. */
  previousReceipt?: MessageReceipt;

  /** Initial live message state. */
  preview?: LiveMessageState<TPayload>;

  /** Callback when delivery intent is established. */
  onDeliveryIntent?: (intent: DurableMessageSendIntent) => void;

  /** Callback when preview is updated. */
  onPreviewUpdate?: (
    rendered: RenderedMessageBatch<TPayload>,
    state: LiveMessageState<TPayload>,
  ) => Promise<LiveMessageState<TPayload>> | LiveMessageState<TPayload>;

  /** Callback when a receipt is edited. */
  onEditReceipt?: (
    receipt: MessageReceipt,
    rendered: RenderedMessageBatch<TPayload>,
  ) => Promise<MessageReceipt> | MessageReceipt;

  /** Callback when a receipt is deleted. */
  onDeleteReceipt?: (receipt: MessageReceipt) => Promise<void> | void;

  /** Callback when a receipt is committed. */
  onCommitReceipt?: (receipt: MessageReceipt) => Promise<void> | void;

  /** Callback when send fails. */
  onSendFailure?: (error: unknown) => Promise<void> | void;
}

/**
 * Stable intent record for a durable outbound message send.
 */
export interface DurableMessageSendIntent {
  id: string;
  channel: ChannelId;
  to: string;
  accountId?: AccountId;
  durability: "required" | "best_effort";
  renderedBatch?: RenderedMessageBatch;
}
