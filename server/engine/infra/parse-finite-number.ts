/**
 * 严格有限数字解析 — 用于 HTTP/配置边界
 *
 * 参考 openclaw/src/infra/parse-finite-number.ts
 */

/** 解析严格非负整数；输入非有限或为负返回 undefined */
export function parseStrictNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  // 拒绝 "10px"、"1e2"、"0x10" 等非纯数字
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 解析有限正整数；输入非有限或 ≤ 0 返回 undefined */
export function parseStrictPositiveInteger(value: unknown): number | undefined {
  const parsed = parseStrictNonNegativeInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/** 解析有限数字；输入非有限返回 undefined */
export function parseFiniteNumber(value: unknown): number | undefined {
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
