const TIMER_TIMEOUT_GRACE_MS = 500;

export function addTimerTimeoutGraceMs(value: number): number {
  return value + TIMER_TIMEOUT_GRACE_MS;
}

export function clampPositiveTimerTimeoutMs(value: number | undefined): number | undefined {
  if (value === undefined || value <= 0) {
    return undefined;
  }
  return Math.max(0, value);
}
