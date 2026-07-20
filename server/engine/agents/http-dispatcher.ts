/**
 * 移植自 openclaw/src/agents/sessions/http-dispatcher.ts
 *
 * HTTP session dispatcher config helpers.
 * Parses idle-timeout values shared by server and config surfaces.
 */

/** Default HTTP idle timeout in milliseconds (5 minutes). */
export const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000;

/** Parses idle timeout values, using `0` for the explicit disabled sentinel. */
export function parseHttpIdleTimeoutMs(value: unknown): number | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === "disabled") {
      return 0;
    }
    if (trimmed.length === 0) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      return undefined;
    }
    return parsed;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}
