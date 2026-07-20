/**
 * 移植自 openclaw/src/agents/subagent-run-timeout.ts
 *
 * Subagent run timeout math.
 * Separates timer-safe delays from duration/deadline values because setTimeout has stricter bounds.
 * cross-wms 完整移植：所有逻辑为纯数学运算，无外部依赖。
 */

function asDateTimestampMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function finiteSecondsToTimerSafeMilliseconds(seconds: unknown, options?: { floorSeconds?: boolean }): number | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  const floored = options?.floorSeconds ? Math.floor(seconds) : seconds;
  const ms = floored * 1000;
  if (!Number.isFinite(ms) || ms <= 0 || ms > 2_147_483_647) {
    return undefined;
  }
  return Math.floor(ms);
}

/** Convert subagent timeout seconds to a timer-safe delay. */
export function resolveSubagentRunTimerDelayMs(timeoutSeconds: unknown): number | undefined {
  return finiteSecondsToTimerSafeMilliseconds(timeoutSeconds, { floorSeconds: true });
}

/** Convert subagent timeout seconds to a finite millisecond duration. */
export function resolveSubagentRunDurationMs(timeoutSeconds: unknown): number | undefined {
  if (
    typeof timeoutSeconds !== "number" ||
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0
  ) {
    return undefined;
  }
  const durationMs = Math.floor(timeoutSeconds) * 1000;
  return Number.isSafeInteger(durationMs) && durationMs > 0 ? durationMs : undefined;
}

/** Resolve the absolute timeout deadline for a subagent run. */
export function resolveSubagentRunDeadlineMs(
  entry: { createdAt: number; startedAt?: number; runTimeoutSeconds?: number },
  observedStartedAt?: number,
): number | undefined {
  const durationMs = resolveSubagentRunDurationMs(entry.runTimeoutSeconds);
  if (durationMs === undefined) {
    return undefined;
  }
  const startedAt =
    typeof observedStartedAt === "number" && Number.isFinite(observedStartedAt)
      ? observedStartedAt
      : typeof entry.startedAt === "number" && Number.isFinite(entry.startedAt)
        ? entry.startedAt
        : entry.createdAt;
  const safeStartedAt = asDateTimestampMs(startedAt);
  if (safeStartedAt === undefined) {
    return undefined;
  }
  const deadlineMs = safeStartedAt + durationMs;
  return Number.isSafeInteger(deadlineMs) && asDateTimestampMs(deadlineMs) !== undefined
    ? deadlineMs
    : undefined;
}
