// 将目录前置到 PATH 同时保留既有顺序。
import path from "node:path";
import {
  normalizeStringEntries,
  normalizeUniqueStringEntries,
} from "./string-normalization.js";

/**
 * 在 env 对象中查找实际使用的 PATH 键名。
 * Windows 上 process.env 会把 PATH 存为 Path（非 PATH），复制到普通对象后保留原始大小写。
 */
export function findPathKey(env: Record<string, string>): string {
  if ("PATH" in env) {
    return "PATH";
  }
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === "PATH") {
      return key;
    }
  }
  return "PATH";
}

/** 规范化配置的 PATH 前置条目：去除空白/空值，保留首次出现的顺序 */
export function normalizePathPrepend(entries?: string[]) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/** 将前置 PATH 条目合并到既有 PATH 之前，并对规范化后的分段去重 */
export function mergePathPrepend(existing: string | undefined, prepend: string[]) {
  if (prepend.length === 0) {
    return existing;
  }
  return normalizeUniqueStringEntries([
    ...prepend,
    ...(existing ?? "").split(path.delimiter),
  ]).join(path.delimiter);
}

/** 从既有 PATH 中移除受管理的前置条目，包括后续重复副本 */
export function removePathPrepend(
  existing: string | undefined,
  prepend: string[],
): string | undefined {
  if (!existing || prepend.length === 0) {
    return existing;
  }

  const prependEntries = new Set<string>(normalizeStringEntries(prepend));

  const remaining = normalizeStringEntries((existing ?? "").split(path.delimiter)).filter(
    (part) => !prependEntries.has(part),
  );

  return remaining.join(path.delimiter);
}

/** 就地应用配置的 PATH 前置，保留 Windows PATH 键大小写 */
export function applyPathPrepend(
  env: Record<string, string>,
  prepend: string[] | undefined,
  options?: { requireExisting?: boolean },
) {
  if (!Array.isArray(prepend) || prepend.length === 0) {
    return;
  }
  // Windows 上 PATH 键可能存为 Path（环境变量大小写不敏感）。强制转普通对象后保留原始大小写，
  // 因此必须查找实际键名来读取既有值并写回合并结果。
  const pathKey = findPathKey(env);
  if (options?.requireExisting && !env[pathKey]) {
    return;
  }
  const merged = mergePathPrepend(env[pathKey], prepend);
  if (merged) {
    env[pathKey] = merged;
  }
}
