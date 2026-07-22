import { logger } from "../../../logger.js";
import type { ProposalEvent, ProposalEventPayload } from "./types.js";

type ProposalEventListener = (event: ProposalEvent) => void;

const listeners: Map<string, Set<ProposalEventListener>> = new Map();

export function onProposalEvent(
  eventType: ProposalEvent["type"],
  listener: ProposalEventListener,
): void {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }
  listeners.get(eventType)!.add(listener);
  logger.debug("[Skills] Registered listener for proposal event:", eventType);
}

export function offProposalEvent(
  eventType: ProposalEvent["type"],
  listener: ProposalEventListener,
): void {
  const eventListeners = listeners.get(eventType);
  if (eventListeners) {
    eventListeners.delete(listener);
    logger.debug("[Skills] Unregistered listener for proposal event:", eventType);
  }
}

export function emitProposalEvent(
  type: ProposalEvent["type"],
  payload: ProposalEventPayload,
): void {
  const event: ProposalEvent = { type, payload };
  const eventListeners = listeners.get(type);

  if (eventListeners) {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error("[Skills] Error in proposal event listener:", err);
      }
    }
  }

  logger.info("[Skills] Emitted proposal event:", type, payload.proposalId);
}

export function clearProposalEventListeners(): void {
  listeners.clear();
  logger.debug("[Skills] Cleared all proposal event listeners");
}