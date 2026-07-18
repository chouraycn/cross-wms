/**
 * Record 强制转换辅助 — 移植自 openclaw/packages/normalization-core/record-coerce
 * 用于在浏览器/Node 边界安全地将任意值识别为 record
 */

/** 非数组对象 record 类型守卫 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 将 object-like 值强制转换为 record，否则返回空 record */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** 仅当字段存在且为字符串时读取 */
export function readStringField(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

/** 返回非数组 record 或 undefined */
export function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** 返回非数组 record 或 null */
export function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/** 返回任意 object-backed record（含数组）或 undefined */
export function asOptionalObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/** 返回任意 object-backed record（含数组）或 null */
export function asNullableObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
