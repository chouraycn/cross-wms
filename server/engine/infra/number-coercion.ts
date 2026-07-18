/**
 * Number 强制转换辅助 — 移植自 openclaw/packages/normalization-core/number-coercion
 * 提供数字边界检查、范围校验、时间戳格式化等。
 */

/** 仅当输入为有限数字时返回它 */
export function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 当输入为有限数字且满足范围约束时返回它 */
export function asFiniteNumberInRange(
  value: unknown,
  range: {
    min?: number;
    max?: number;
    minExclusive?: boolean;
    maxExclusive?: boolean;
  },
): number | undefined {
  const number = asFiniteNumber(value);
  if (number === undefined) {
    return undefined;
  }
  if (range.min !== undefined) {
    if (range.minExclusive ? number <= range.min : number < range.min) {
      return undefined;
    }
  }
  if (range.max !== undefined) {
    if (range.maxExclusive ? number >= range.max : number > range.max) {
      return undefined;
    }
  }
  return number;
}

/** 仅当输入为正整数时返回它 */
export function asPositiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

/** 仅当输入为 0 或正整数时返回它 */
export function asNonNegativeSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** 仅当输入为指定范围内的整数时返回它 */
export function asSafeIntegerInRange(
  value: unknown,
  range: { min?: number; max?: number },
): number | undefined {
  const number = asNonNegativeSafeInteger(value);
  if (number === undefined) {
    return undefined;
  }
  if (range.min !== undefined && number < range.min) {
    return undefined;
  }
  if (range.max !== undefined && number > range.max) {
    return undefined;
  }
  return number;
}

/** 严格解析有限数字字符串，拒绝 NaN/Infinity/非数字 */
export function parseStrictFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const UNIX_EPOCH_ISO_STRING = "1970-01-01T00:00:00.000Z";
const MAX_TIMER_TIMEOUT_MS = 2 ** 31 - 1;
const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000;

/** 仅当输入为 Date-valid 毫秒时间戳时返回它 */
export function asDateTimestampMs(value: unknown): number | undefined {
  return asFiniteNumberInRange(value, {
    min: -MAX_DATE_TIMESTAMP_MS,
    max: MAX_DATE_TIMESTAMP_MS,
  });
}

/** 检查 Date-valid 时间戳是否晚于给定/当前时间 */
export function isFutureDateTimestampMs(
  value: unknown,
  opts: { nowMs?: number } = {},
): value is number {
  const timestampMs = asDateTimestampMs(value);
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  return timestampMs !== undefined && nowMs !== undefined && timestampMs > nowMs;
}

/** 将毫秒时间戳解析为 ISO 字符串 */
export function timestampMsToIsoString(
  value: unknown,
  fallbackValue: unknown = Date.now(),
): string | undefined {
  const ms = asFiniteNumber(value) ?? asFiniteNumber(fallbackValue);
  if (ms === undefined) {
    return undefined;
  }
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

function resolveTimestampMsToIsoString(
  value: unknown,
  fallbackValue: unknown = Date.now(),
): string {
  return (
    timestampMsToIsoString(value) ??
    timestampMsToIsoString(fallbackValue) ??
    UNIX_EPOCH_ISO_STRING
  );
}

/** 将时间戳格式化为文件名安全的 ISO 字符串（冒号替换为连字符） */
export function timestampMsToIsoFileStamp(
  value: unknown,
  fallbackValue: unknown = Date.now(),
): string {
  return resolveTimestampMsToIsoString(value, fallbackValue).replaceAll(":", "-");
}

/** 将毫秒值钳制到 Node 安全的定时器范围 */
export function clampTimerTimeoutMs(valueMs: unknown, minMs = 1): number | undefined {
  const value = asFiniteNumber(valueMs);
  if (value === undefined) {
    return undefined;
  }
  const min = Math.max(1, Math.floor(minMs));
  return Math.min(Math.max(Math.floor(value), min), MAX_TIMER_TIMEOUT_MS);
}

/** 从正毫秒持续时间解析绝对过期时间戳 */
export function resolveExpiresAtMsFromDurationMs(
  value: unknown,
  opts: { nowMs?: number; bufferMs?: number; minRemainingMs?: number } = {},
): number | undefined {
  const durationMs = asPositiveSafeInteger(value);
  if (durationMs === undefined) {
    return undefined;
  }
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  const bufferMs = asFiniteNumber(opts.bufferMs ?? 0);
  if (nowMs === undefined || bufferMs === undefined) {
    return undefined;
  }
  const expiresAt = nowMs + durationMs - bufferMs;
  if (!Number.isSafeInteger(expiresAt) || timestampMsToIsoString(expiresAt) === undefined) {
    return undefined;
  }
  const minRemainingMs = opts.minRemainingMs;
  if (minRemainingMs === undefined) {
    return expiresAt;
  }
  const minExpiresAt = nowMs + minRemainingMs;
  if (!Number.isSafeInteger(minExpiresAt) || timestampMsToIsoString(minExpiresAt) === undefined) {
    return expiresAt;
  }
  return Math.max(expiresAt, minExpiresAt);
}
