// 移植自 openclaw/src/infra/heartbeat-cooldown.ts

export const DEFAULT_MIN_WAKE_SPACING_MS = 60_000;
export const DEFAULT_FLOOD_WINDOW_MS = 300_000;
export const DEFAULT_FLOOD_THRESHOLD = 3;

export type DeferDecision = { defer: boolean; reason?: string };
export type ShouldDeferInput = {
  sessionKey: string;
  nowMs: number;
  minWakeSpacingMs?: number;
  floodWindowMs?: number;
  floodThreshold?: number;
};

const runStarts = new Map<string, number[]>();

/** Checks whether a heartbeat wake should be deferred based on cooldown rules. */
export function shouldDeferWake(input: ShouldDeferInput): DeferDecision {
  const minSpacing = input.minWakeSpacingMs ?? DEFAULT_MIN_WAKE_SPACING_MS;
  const floodWindow = input.floodWindowMs ?? DEFAULT_FLOOD_WINDOW_MS;
  const floodThreshold = input.floodThreshold ?? DEFAULT_FLOOD_THRESHOLD;

  const starts = runStarts.get(input.sessionKey) ?? [];
  if (starts.length === 0) return { defer: false };

  const lastStart = starts[starts.length - 1]!;
  if (input.nowMs - lastStart < minSpacing) {
    return { defer: true, reason: "min-wake-spacing" };
  }

  const recentStarts = starts.filter((t) => input.nowMs - t < floodWindow);
  if (recentStarts.length >= floodThreshold) {
    return { defer: true, reason: "flood-threshold" };
  }

  return { defer: false };
}

/** Records a run start for cooldown tracking. */
export function recordRunStart(sessionKey: string, nowMs: number): void {
  const starts = runStarts.get(sessionKey) ?? [];
  starts.push(nowMs);
  // Keep only recent entries
  const cutoff = nowMs - (DEFAULT_FLOOD_WINDOW_MS * 2);
  const filtered = starts.filter((t) => t >= cutoff);
  runStarts.set(sessionKey, filtered);
}
