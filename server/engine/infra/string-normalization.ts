/**
 * 字符串列表规范化 — 字符串条目去空白/去空、去重、排序等基础工具
 *
 * 参考 openclaw/packages/normalization-core/src/string-normalization.ts
 */
import { normalizeOptionalLowercaseString, normalizeOptionalString } from "./string-coerce.js";

/** 将条目强制为字符串、去空白、丢弃空结果 */
export function normalizeStringEntries(list?: ReadonlyArray<unknown>): string[] {
  return (list ?? [])
    .map((entry) => normalizeOptionalString(String(entry)) ?? "")
    .filter(Boolean);
}

/** 规范化字符串条目并将每个保留值转为小写 */
export function normalizeStringEntriesLower(list?: ReadonlyArray<unknown>): string[] {
  return normalizeStringEntries(list).map(
    (entry) => normalizeOptionalLowercaseString(entry) ?? "",
  );
}

/** 返回首次出现的唯一值，保留插入顺序 */
export function uniqueValues<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

/** 返回首次出现的唯一字符串，保留插入顺序 */
export function uniqueStrings(values: Iterable<string>): string[] {
  return uniqueValues(values);
}

/** 返回唯一字符串，使用稳定的 ASCII 比较排序 */
export function sortUniqueStrings(values: Iterable<string>): string[] {
  return uniqueStrings(values).toSorted((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

/** 规范化条目、去重、保留首次出现的顺序 */
export function normalizeUniqueStringEntries(values?: Iterable<unknown>): string[] {
  return uniqueStrings(normalizeStringEntries(values ? [...values] : undefined));
}

/** 小写、规范化、去空去重，保留首次出现的顺序 */
export function normalizeUniqueStringEntriesLower(values?: Iterable<unknown>): string[] {
  return uniqueStrings(
    normalizeStringEntriesLower(values ? [...values] : undefined).filter(Boolean),
  );
}

/** 规范化条目、去重、并返回排序后的结果 */
export function normalizeSortedUniqueStringEntries(values?: Iterable<unknown>): string[] {
  return sortUniqueStrings(normalizeUniqueStringEntries(values));
}

/** 规范化数组形式的字符串列表，非数组输入返回空数组 */
export function normalizeTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const normalized = normalizeOptionalString(entry);
    return normalized ? [normalized] : [];
  });
}

/** 规范化数组形式的字符串列表并去重 */
export function normalizeUniqueTrimmedStringList(value: unknown): string[] {
  return uniqueStrings(normalizeTrimmedStringList(value));
}

/** 规范化数组形式的字符串列表、去重并排序 */
export function normalizeSortedUniqueTrimmedStringList(value: unknown): string[] {
  return sortUniqueStrings(normalizeTrimmedStringList(value));
}

/** 返回 undefined 替代空数组（用于可选字段） */
export function normalizeOptionalTrimmedStringList(value: unknown): string[] | undefined {
  const normalized = normalizeTrimmedStringList(value);
  return normalized.length > 0 ? normalized : undefined;
}

/** 非数组返回 undefined，但保留显式空数组 */
export function normalizeArrayBackedTrimmedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return normalizeTrimmedStringList(value);
}

/** 规范化单个字符串值或数组形式的字符串列表 */
export function normalizeSingleOrTrimmedStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeTrimmedStringList(value);
  }
  const normalized = normalizeOptionalString(value);
  return normalized ? [normalized] : [];
}

/** 规范化单值或数组形式并去重 */
export function normalizeUniqueSingleOrTrimmedStringList(value: unknown): string[] {
  return uniqueStrings(normalizeSingleOrTrimmedStringList(value));
}

/** 解析数组条目或逗号分隔字符串为去空白后的列表 */
export function normalizeCsvOrLooseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeStringEntries(value);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSlugInput(raw?: string | null): string {
  // NFC 让视觉相同但分解形式不同的 Unicode 标签匹配同一 slug
  return (normalizeOptionalLowercaseString(raw) ?? "").normalize("NFC");
}

/** 将用户可见名称规范化为容许 #/@/._+ 的宽松小写 slug */
export function normalizeHyphenSlug(raw?: string | null): string {
  const trimmed = normalizeSlugInput(raw);
  if (!trimmed) {
    return "";
  }
  const dashed = trimmed.replace(/\s+/g, "-");
  const cleaned = dashed.replace(/[^\p{L}\p{M}\p{N}#@._+-]+/gu, "-");
  return cleaned.replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
}

/** 将 @/# 前缀的频道名规范化为去除前缀的严格小写连字符 slug */
export function normalizeAtHashSlug(raw?: string | null): string {
  const trimmed = normalizeSlugInput(raw);
  if (!trimmed) {
    return "";
  }
  const withoutPrefix = trimmed.replace(/^[@#]+/, "");
  const dashed = withoutPrefix.replace(/[\s_]+/g, "-");
  const cleaned = dashed.replace(/[^\p{L}\p{M}\p{N}-]+/gu, "-");
  return cleaned.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
