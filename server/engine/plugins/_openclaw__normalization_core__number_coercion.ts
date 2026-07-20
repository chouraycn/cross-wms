const TIMER_TIMEOUT_GRACE_MS = 500;

export function addTimerTimeoutGraceMs(value: number): number {
  return value + TIMER_TIMEOUT_GRACE_MS;
}

export function clampPositiveTimerTimeoutMs(value: number): number {
  return Math.max(0, value);
}
