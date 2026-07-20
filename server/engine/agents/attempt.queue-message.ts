/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.queue-message.ts
 *
 * Steers active embedded sessions and waits for transcript commits when needed.
 * cross-wms provides simplified implementations since the full embedded agent
 * runner infrastructure is not available.
 */

/** Minimal active-session surface needed to steer a running attempt. */
export type EmbeddedAgentActiveSessionSteerTarget = {
  agent?: unknown;
  getSteeringMessages?(): readonly string[];
  steer(text: string): Promise<void>;
  subscribe(listener: (event: unknown) => void): () => void;
};

/**
 * Removes one pending steered user message from both the runtime queue and UI
 * steering list. Returns false in cross-wms since queue manipulation is not available.
 */
export async function cancelQueuedSteeringMessage(
  _activeSession: EmbeddedAgentActiveSessionSteerTarget,
  _text: string,
): Promise<boolean> {
  // cross-wms does not have access to the internal steering queue.
  return false;
}

/**
 * Sends a steering message and resolves only after the matching user
 * message_end event appears. In cross-wms this simply steers and returns
 * since transcript commit observation is not available.
 */
export async function steerAndWaitForTranscriptCommit(
  activeSession: EmbeddedAgentActiveSessionSteerTarget,
  text: string,
  _timeoutMs: number,
): Promise<void> {
  // cross-wms lacks the subscription infrastructure for observing transcript commits.
  // Just steer directly.
  await activeSession.steer(text);
}

/**
 * Steers the active session directly or waits for transcript commitment when a
 * caller needs delivery proof before returning.
 */
export async function steerActiveSessionWithOptionalDeliveryWait(
  activeSession: EmbeddedAgentActiveSessionSteerTarget,
  text: string,
  options: { deliveryTimeoutMs?: number; waitForTranscriptCommit?: boolean } | undefined,
): Promise<void> {
  if (options?.waitForTranscriptCommit !== true) {
    await activeSession.steer(text);
    return;
  }
  await steerAndWaitForTranscriptCommit(
    activeSession,
    text,
    options.deliveryTimeoutMs ?? 120_000,
  );
}
