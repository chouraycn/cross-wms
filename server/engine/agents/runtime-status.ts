/**
 * Sandbox / runtime status check for embedded agents.
 * Ported from openclaw/src/agents/sandbox/runtime-status.ts
 *
 * Note: Full sandbox infrastructure not available in cross-wms.
 */

/** Returns whether sandbox runtime is available and active. */
export function isSandboxRuntimeAvailable(): boolean {
  // Full sandbox infrastructure not available in cross-wms
  return false;
}

/** Returns the current runtime status. */
export function getRuntimeStatus(): {
  available: boolean;
  type?: string;
  connected?: boolean;
  sessionId?: string;
} {
  return {
    available: false,
    type: undefined,
    connected: false,
    sessionId: undefined,
  };
}

/** Wait for sandbox runtime to become ready, up to an optional timeout. */
export async function waitForRuntimeReady(_timeoutMs?: number): Promise<boolean> {
  // Full sandbox infrastructure not available in cross-wms
  return false;
}
