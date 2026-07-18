/**
 * 字符串规范化辅助 — 供移植自 openclaw 的工具模块共享使用
 * 参考 openclaw/packages/normalization-core/string-coerce
 */

/** 将任意输入规范化为非空字符串（去除首尾空白），输入无效时返回 undefined */
export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 将任意输入规范化为非空小写字符串，输入无效时返回 undefined */
export function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized !== undefined ? normalized.toLowerCase() : undefined;
}
