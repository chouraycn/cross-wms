import { logger } from "../../../logger.js";
import type { MessageStatus, MessageLifecyclePhase } from "./types.js";

export interface MessageState {
  messageId: string;
  status: MessageStatus;
  phase: MessageLifecyclePhase;
  error?: string;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

const messageStates = new Map<string, MessageState>();

export function initMessageState(messageId: string, metadata?: Record<string, unknown>): MessageState {
  const now = Date.now();
  const state: MessageState = {
    messageId,
    status: "pending",
    phase: "received",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    metadata: metadata ?? {},
  };

  messageStates.set(messageId, state);
  return state;
}

export function getMessageState(messageId: string): MessageState | undefined {
  return messageStates.get(messageId);
}

export function updateMessageStatus(messageId: string, status: MessageStatus, error?: string): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;

  state.status = status;
  state.updatedAt = Date.now();
  if (error) state.error = error;

  logger.debug(`[Message:State] ${messageId} status -> ${status}`);
  return true;
}

export function updateMessagePhase(messageId: string, phase: MessageLifecyclePhase): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;

  state.phase = phase;
  state.updatedAt = Date.now();

  return true;
}

export function incrementAttempt(messageId: string): number {
  const state = messageStates.get(messageId);
  if (!state) return -1;

  state.attemptCount++;
  state.updatedAt = Date.now();
  return state.attemptCount;
}

export function setMessageMetadata(messageId: string, key: string, value: unknown): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;

  state.metadata[key] = value;
  state.updatedAt = Date.now();
  return true;
}

export function getMessageMetadata(messageId: string, key: string): unknown {
  return messageStates.get(messageId)?.metadata[key];
}

export function removeMessageState(messageId: string): boolean {
  return messageStates.delete(messageId);
}

export function clearMessageStates(): void {
  messageStates.clear();
}

export function listMessageStates(options?: {
  status?: MessageStatus;
  phase?: MessageLifecyclePhase;
  limit?: number;
}): MessageState[] {
  let states = Array.from(messageStates.values());

  if (options?.status) {
    states = states.filter((s) => s.status === options.status);
  }

  if (options?.phase) {
    states = states.filter((s) => s.phase === options.phase);
  }

  if (options?.limit) {
    states = states.slice(0, options.limit);
  }

  return states;
}

export function isMessageInProgress(messageId: string): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;
  return state.status === "pending" || state.status === "queued" || state.status === "sending";
}

export function isMessageFailed(messageId: string): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;
  return state.status === "failed" || state.status === "expired" || state.status === "cancelled";
}

export function isMessageComplete(messageId: string): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;
  return state.status === "sent" || state.status === "delivered" || state.status === "read";
}
