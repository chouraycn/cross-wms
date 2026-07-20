/**
 * 移植自 openclaw/src/agents/runtime-auth-refresh.ts
 *
 * Runtime auth refresh timer helper.
 * Clamps refresh deadlines before they are passed to setTimeout.
 */

/** Clamp an auth refresh deadline to a safe setTimeout delay. */
export function clampRuntimeAuthRefreshDelayMs(params: {
  refreshAt: number;
  now: number;
  minDelayMs: number;
}): number {
  const delay = params.refreshAt - params.now;
  const minMs = params.minDelayMs;
  if (!Number.isFinite(delay) || delay <= 0) {
    return minMs;
  }
  return Math.max(delay, minMs);
}
