/**
 * Ported from openclaw/src/agents/acp-spawn-parent-stream.ts
 *
 * Relays child ACP session stream updates back into the requester parent session.
 * Cross-wms degradation: returns safe no-op implementations without openclaw
 * event system / session file resolution.
 */

export type AcpSpawnParentRelayHandle = {
  dispose: () => void;
  notifyStarted: () => void;
};

/** Resolves the JSONL stream log path for an ACP child session when metadata exists. */
export function resolveAcpSpawnStreamLogPath(params: {
  childSessionKey: string;
}): string | undefined {
  // Cross-wms does not have ACP session entry resolution.
  return undefined;
}

/** Starts a bounded parent-session relay for child ACP output and progress notices. */
export function startAcpSpawnParentStreamRelay(params: {
  runId: string;
  parentSessionKey: string;
  childSessionKey: string;
  agentId: string;
  mainKey?: string;
  sessionScope?: "per-sender" | "global";
  eventRouting?: Record<string, unknown>;
  logPath?: string;
  deliveryContext?: Record<string, unknown>;
  surfaceUpdates?: boolean;
  streamFlushMs?: number;
  noOutputNoticeMs?: number;
  noOutputPollMs?: number;
  maxRelayLifetimeMs?: number;
  emitStartNotice?: boolean;
  cfg?: Record<string, unknown>;
}): AcpSpawnParentRelayHandle {
  // Cross-wms does not have the full agent event system for relay.
  // Return a no-op handle so callers don't crash.
  return {
    dispose: () => {},
    notifyStarted: () => {},
  };
}
