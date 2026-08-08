/**
 * Record 强制转换辅助 — 移植自 openclaw/packages/normalization-core/record-coerce
 * 用于在浏览器/Node 边界安全地将任意值识别为 record
 */

/** 非数组对象 record 类型守卫 */
export function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 将 object-like 值强制转换为 record，否则返回空 record */
export function asRecord(value: any): Record<string, any> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, any>)
    : {};
}

/** 仅当字段存在且为字符串时读取 */
export function readStringField(
  record: Record<string, any> | null | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

/** 返回非数组 record 或 undefined */
export function asOptionalRecord(value: any): Record<string, any> | undefined {
  return isRecord(value) ? value : undefined;
}

/** 返回非数组 record 或 null */
export function asNullableRecord(value: any): Record<string, any> | null {
  return isRecord(value) ? value : null;
}

/** 返回任意 object-backed record（含数组）或 undefined */
export function asOptionalObjectRecord(value: any): Record<string, any> | undefined {
  return value && typeof value === "object" ? (value as Record<string, any>) : undefined;
}

/** 返回任意 object-backed record（含数组）或 null */
export function asNullableObjectRecord(value: any): Record<string, any> | null {
  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}
