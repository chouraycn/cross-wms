/**
 * 计时器延迟辅助 — 将延迟钳制到 runtime 安全的超时值
 *
 * Node.js 的 setTimeout 使用 32 位有符号整数存储延迟，
 * 超过 2^31 - 1 毫秒（约 24.8 天）的值会立即触发。
 * 本模块将任意输入钳制到安全范围，避免定时器立即触发。
 *
 * 参考 openclaw/src/utils/timer-delay.ts 与 packages/gateway-client/src/timeouts.ts
 */

/** Node.js 定时器可表示的最大延迟，不会触发溢出警告 */
export const MAX_SAFE_TIMEOUT_DELAY_MS = 2_147_483_647;

/** 将任意计时器延迟钳制到 Node 的安全范围与可选下限 */
export function resolveSafeTimeoutDelayMs(delayMs: number, opts?: { minMs?: number }): number {
  const rawMinMs = opts?.minMs ?? 1;
  const minMs = Math.min(
    MAX_SAFE_TIMEOUT_DELAY_MS,
    Math.max(0, Number.isFinite(rawMinMs) ? Math.floor(rawMinMs) : 1),
  );
  const candidateMs = Number.isFinite(delayMs) ? Math.floor(delayMs) : minMs;
  return Math.min(MAX_SAFE_TIMEOUT_DELAY_MS, Math.max(minMs, candidateMs));
}

/** 在保持安全定时器边界的前提下附加宽限期，输入溢出或无效时使用上限 */
export function addSafeTimeoutDelayGraceMs(
  delayMs: number,
  graceMs: number,
  opts?: { minMs?: number },
): number {
  if (!Number.isFinite(delayMs) || !Number.isFinite(graceMs)) {
    return resolveSafeTimeoutDelayMs(MAX_SAFE_TIMEOUT_DELAY_MS, opts);
  }
  const withGrace = delayMs + graceMs;
  return resolveSafeTimeoutDelayMs(
    Number.isFinite(withGrace) ? withGrace : MAX_SAFE_TIMEOUT_DELAY_MS,
    opts,
  );
}

/** 通过 fallback 与安全定时器钳制解析可选的超时值 */
export function resolveFiniteTimeoutDelayMs(
  delayMs: number | null | undefined,
  fallbackMs: number,
  opts?: { minMs?: number },
): number {
  const candidateMs =
    typeof delayMs === "number" && Number.isFinite(delayMs) ? delayMs : fallbackMs;
  return resolveSafeTimeoutDelayMs(candidateMs, opts);
}

/** setTimeout 包装，在装定时器前钳制不安全或无效的延迟 */
export function setSafeTimeout(
  callback: () => void,
  delayMs: number,
  opts?: { minMs?: number },
): NodeJS.Timeout {
  return setTimeout(callback, resolveSafeTimeoutDelayMs(delayMs, opts));
}
