import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelMessage } from "../message/types.js";

export type TurnStatus = "pending" | "active" | "responding" | "complete" | "failed" | "cancelled";

export type TurnSource = "user" | "system" | "bot" | "webhook" | "api";

export interface TurnContext {
  turnId: string;
  channelId: ChannelId;
  accountId?: AccountId;
  conversationId: string;
  threadId?: string;
  status: TurnStatus;
  source: TurnSource;
  inputMessage?: ChannelMessage;
  outputMessages: ChannelMessage[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata: Record<string, unknown>;
}

export interface TurnWindow {
  turns: TurnContext[];
  windowStart: number;
  windowEnd: number;
  count: number;
}

export type DeliveryStatus = "pending" | "delivered" | "failed" | "retrying" | "skipped";

export interface DeliveryResult {
  turnId: string;
  messageId: string;
  status: DeliveryStatus;
  attempt: number;
  deliveredAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type DispatchStatus = "accepted" | "rejected" | "queued" | "duplicate";

export interface DispatchResult {
  turnId: string;
  status: DispatchStatus;
  reason?: string;
  queuePosition?: number;
  metadata?: Record<string, unknown>;
}

export interface BotLoopProtectionState {
  conversationId: string;
  consecutiveBotMessages: number;
  lastBotMessageAt: number;
  lastUserMessageAt: number;
  isSuppressed: boolean;
  suppressionReason?: string;
}

export interface TurnGuardrailConfig {
  maxTurnsPerConversation?: number;
  maxTurnsPerMinute?: number;
  minIntervalMs?: number;
  maxInputLength?: number;
  maxOutputLength?: number;
  requireUserInput?: boolean;
}

export interface GuardrailViolation {
  rule: string;
  message: string;
  severity: "warning" | "error";
}
