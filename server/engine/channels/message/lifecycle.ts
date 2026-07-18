import { logger } from "../../../logger.js";
import type {
  ChannelMessage,
  MessageLifecyclePhase,
  MessageLifecycleEvent,
} from "./types.js";

type LifecycleListener = (event: MessageLifecycleEvent) => void;

const lifecycleListeners = new Set<LifecycleListener>();
const messageStates = new Map<string, {
  message: ChannelMessage;
  phases: MessageLifecyclePhase[];
}>();

export function onMessageLifecycleEvent(listener: LifecycleListener): () => void {
  lifecycleListeners.add(listener);
  return () => lifecycleListeners.delete(listener);
}

export function emitLifecycleEvent(
  messageId: string,
  phase: MessageLifecyclePhase,
  metadata?: Record<string, unknown>
): void {
  const event: MessageLifecycleEvent = {
    messageId,
    phase,
    timestamp: Date.now(),
    metadata,
  };

  logger.debug(`[Message:Lifecycle] ${messageId} -> ${phase}`);

  for (const listener of lifecycleListeners) {
    try {
      listener(event);
    } catch (err) {
      logger.error(`[Message:Lifecycle] Listener error for phase ${phase}`, { error: err });
    }
  }
}

export function trackMessageLifecycle(message: ChannelMessage): void {
  const existing = messageStates.get(message.id);
  if (existing) {
    existing.message = message;
  } else {
    messageStates.set(message.id, {
      message,
      phases: [],
    });
  }
}

export function advanceMessagePhase(
  messageId: string,
  phase: MessageLifecyclePhase,
  metadata?: Record<string, unknown>
): void {
  const state = messageStates.get(messageId);
  if (state) {
    state.phases.push(phase);
  }
  emitLifecycleEvent(messageId, phase, metadata);
}

export function getMessagePhases(messageId: string): MessageLifecyclePhase[] {
  return messageStates.get(messageId)?.phases ?? [];
}

export function getMessageLifecycleState(messageId: string): {
  message?: ChannelMessage;
  phases: MessageLifecyclePhase[];
} | null {
  const state = messageStates.get(messageId);
  return state ? { ...state } : null;
}

export function clearMessageLifecycle(messageId: string): void {
  messageStates.delete(messageId);
}

export function hasReachedPhase(messageId: string, phase: MessageLifecyclePhase): boolean {
  const state = messageStates.get(messageId);
  if (!state) return false;
  return state.phases.includes(phase);
}

export function isMessageInTerminalState(messageId: string): boolean {
  const phases = getMessagePhases(messageId);
  return phases.includes("failed") || phases.includes("acknowledged") || phases.includes("sent");
}
