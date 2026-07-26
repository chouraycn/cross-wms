// Timer delay helpers clamp delays to runtime-safe timeout values.
// Re-exports from the local infra implementation (equivalent to openclaw's
// packages/gateway-client/src/timeouts.js).
export {
  addSafeTimeoutDelayGraceMs,
  MAX_SAFE_TIMEOUT_DELAY_MS,
  resolveFiniteTimeoutDelayMs,
  resolveSafeTimeoutDelayMs,
  setSafeTimeout,
} from "../infra/timer-delay.js";
