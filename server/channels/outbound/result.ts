/**
 * Outbound message send result types.
 *
 * Defines message receipts, part tracking, and batch send result statuses.
 */
import type { ChannelId } from "../types.js";
import type { RenderedMessagePartKind } from "../message/types.js";

/**
 * One platform message part produced by a logical outbound send.
 */
export interface MessageReceiptPart {
  platformMessageId: string;
  kind: RenderedMessagePartKind;
  index: number;
  threadId?: string;
  replyToId?: string;
}

/**
 * Normalized receipt for all platform messages that make up a logical send.
 */
export interface MessageReceipt {
  id: string;
  platformMessageIds: string[];
  parts: MessageReceiptPart[];
  sentAt: number;
  editedAt?: number;
  deletedAt?: number;
}

/**
 * Status of a durable message batch send operation.
 */
export type DurableMessageBatchSendResultStatus =
  | "sent"
  | "suppressed"
  | "partial_failed"
  | "failed";

/**
 * Per-payload delivery outcome for batch sends.
 */
export interface DurableMessagePartResult {
  index: number;
  status: "sent" | "suppressed" | "failed";
  platformMessageIds?: string[];
  error?: Error;
  reason?: string;
}

/**
 * Result of a durable message batch send operation.
 */
export interface DurableMessageBatchSendResult {
  status: DurableMessageBatchSendResultStatus;
  receipt?: MessageReceipt;
  error?: Error;
  parts?: DurableMessagePartResult[];
}

/**
 * Suppression reason when a payload is intentionally not sent.
 */
export type MessageSendSuppressionReason =
  | "cancelled_by_hook"
  | "empty_after_hook"
  | "no_visible_payload"
  | "adapter_returned_no_identity";

/**
 * Delivery failure stage for error classification.
 */
export type MessageSendFailureStage = "platform_send" | "queue" | "unknown";
