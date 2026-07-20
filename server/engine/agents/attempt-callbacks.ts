/**
 * 移植自 openclaw/src/agents/command/attempt-callbacks.ts
 *
 * Agent attempt lifecycle callbacks.
 * In cross-wms the full attempt lifecycle infrastructure is not available,
 * so createAgentAttemptLifecycleCallbacks returns a no-op callback set.
 */

/** Agent attempt lifecycle state. */
export type AgentAttemptLifecycleState = {
  startedAt?: number;
  endedAt?: number;
  status?: string;
};

/** Create agent attempt lifecycle callbacks (returns no-op callbacks in cross-wms). */
export function createAgentAttemptLifecycleCallbacks(..._args: unknown[]): {
  onStart: () => void;
  onComplete: () => void;
  onError: (_error: unknown) => void;
} {
  return {
    onStart: () => {},
    onComplete: () => {},
    onError: () => {},
  };
}
