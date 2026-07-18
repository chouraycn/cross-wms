/**
 * Cron Store Scalar Codec - 标量编解码
 *
 * 提供 JSON 存储中常用的标量值编解码工具函数。
 */

/** 解析 JSON 对象列，对于格式错误或非对象值返回回退值 */
export function parseJsonObject<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 解析 JSON 列而不进行形状验证，仅在解析失败时返回回退值 */
export function parseJsonValue<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 规范化数字值，处理 bigint 和 null */
export function normalizeNumber(value: number | bigint | null | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  const num = typeof value === "bigint" ? Number(value) : value;
  return Number.isFinite(num) ? num : undefined;
}

/** 将可选布尔值转换为可空整数标志 */
export function booleanToInteger(value: boolean | undefined): number | null {
  return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

/** 将整数标志转换回布尔值，同时保留缺失列为 undefined */
export function integerToBoolean(value: number | bigint | null): boolean | undefined {
  const normalized = normalizeNumber(value);
  return normalized == null ? undefined : normalized !== 0;
}

/** 序列化可选的结构化值用于 JSON 列 */
export function serializeJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

/** 解析 JSON 字符串数组列，并从旧数据中删除非字符串条目 */
export function parseJsonArray(raw: string | null): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = parseJsonObject<unknown>(raw, undefined);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : undefined;
}
