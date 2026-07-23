/**
 * 字符串规范化辅助 — 供移植自 openclaw 的工具模块共享使用
 * 参考 openclaw/packages/normalization-core/string-coerce
 */

/** 当输入本身就是字符串时返回它（保留空白），否则返回 undefined */
export function readStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

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

/** 将任意输入规范化为小写字符串（不去除空白），输入无效时返回空字符串 */
export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return normalizeOptionalLowercaseString(value) ?? "";
}

/** 规范化可能是数字或字符串的线程 id */
export function normalizeOptionalThreadValue(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  return normalizeOptionalString(value);
}

/** 规范化线程/id 值并将有限数字 id 字符串化 */
export function normalizeOptionalStringifiedId(value: unknown): string | undefined {
  const normalized = normalizeOptionalThreadValue(value);
  return normalized == null ? undefined : String(normalized);
}

/** Type guard: 非空字符串 */
export function hasNonEmptyString(value: unknown): value is string {
  return normalizeOptionalString(value) !== undefined;
}

/**
 * FastMode 类型定义（来自 openclaw/packages/normalization-core/string-coerce）
 * 用于 agents 配置中的快速模式开关：true=on, false=off, "auto"=自动
 */
export type FastMode = boolean | "auto";
