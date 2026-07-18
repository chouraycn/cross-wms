/**
 * 共享的 CLI 超时解析器，用于毫秒 flag 与配置回退。
 *
 * 降级说明：原实现依赖 ../infra/parse-finite-number.js 的
 * parseStrictPositiveInteger，cross-wms 暂未移植该模块，这里以本地实现替代。
 */

/** 将字符串解析为严格正整数，无法解析或超出安全整数范围时返回 undefined。 */
function parseStrictPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0) {
    return undefined;
  }
  return num;
}

/** 解析正毫秒超时值，缺失或非法输入返回 undefined。 */
export function parseTimeoutMs(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  let value = Number.NaN;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "bigint") {
    value = Number(raw);
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    return parseStrictPositiveInteger(trimmed);
  }
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function invalidTimeout(value?: string): Error {
  const suffix = value ? ` Received: "${value}".` : "";
  return new Error(
    `Invalid --timeout. Use a positive millisecond value, e.g. --timeout 30000.${suffix}`,
  );
}

/** 解析正超时值，缺失时返回提供的 fallback。 */
export function parseTimeoutMsWithFallback(
  raw: unknown,
  fallbackMs: number,
  options: {
    invalidType?: "fallback" | "error";
  } = {},
): number {
  if (raw === undefined || raw === null) {
    return fallbackMs;
  }

  const value =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" || typeof raw === "bigint"
        ? String(raw)
        : null;

  if (value === null) {
    if (options.invalidType === "error") {
      throw invalidTimeout();
    }
    return fallbackMs;
  }

  if (!value) {
    if (options.invalidType === "error") {
      throw invalidTimeout();
    }
    return fallbackMs;
  }

  const parsed = parseStrictPositiveInteger(value);
  if (parsed === undefined) {
    throw invalidTimeout(value);
  }
  return parsed;
}
