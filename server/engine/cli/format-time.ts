// Simple relative time formatter for CLI output.
// 简化版本：从 openclaw/src/infra/format-time/format-relative.ts 移植

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function formatTimeAgo(ms: number): string {
  if (ms < 0) {
    return "just now";
  }
  if (ms < SECOND_MS) {
    return "just now";
  }
  if (ms < MINUTE_MS) {
    const seconds = Math.floor(ms / SECOND_MS);
    return seconds === 1 ? "1s ago" : `${seconds}s ago`;
  }
  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);
    return minutes === 1 ? "1m ago" : `${minutes}m ago`;
  }
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    return hours === 1 ? "1h ago" : `${hours}h ago`;
  }
  if (ms < WEEK_MS) {
    const days = Math.floor(ms / DAY_MS);
    return days === 1 ? "1d ago" : `${days}d ago`;
  }
  const weeks = Math.floor(ms / WEEK_MS);
  return weeks === 1 ? "1w ago" : `${weeks}w ago`;
}
