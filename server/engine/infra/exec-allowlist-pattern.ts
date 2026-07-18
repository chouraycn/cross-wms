// 移植自 openclaw/src/infra/exec-allowlist-pattern.ts
// 解析 exec 审批 allowlist 的 glob 模式。
//
// 降级策略：
// 1. 源文件依赖 @openclaw/normalization-core/string-coerce 的 normalizeLowercaseStringOrEmpty，
//    cross-wms 中该模块位于 ./string-coerce.js。
// 2. 源文件依赖 ./home-dir.js 的 expandHomePrefix，cross-wms 已有。
// 3. 其余依赖（node:fs、node:path）为 Node.js 内置模块。
import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalLowercaseString } from "./string-coerce.js";
import { expandHomePrefix } from "./home-dir.js";

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return normalizeOptionalLowercaseString(value) ?? "";
}

const GLOB_REGEX_CACHE_LIMIT = 512;
const globRegexCache = new Map<string, RegExp>();

function normalizeMatchTarget(value: string): string {
  if (process.platform === "win32") {
    const stripped = value.replace(/^\\\\[?.]\\/, "");
    return normalizeLowercaseStringOrEmpty(stripped.replace(/\\/g, "/"));
  }
  const normalized = value.replace(/\\\\/g, "/");
  if (process.platform === "darwin") {
    if (normalized === "/private/var") {
      return "/var";
    }
    if (normalized.startsWith("/private/var/")) {
      return normalized.slice("/private".length);
    }
  }
  return normalized;
}

function tryRealpath(value: string): string | null {
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}

function hasDotPathSegment(value: string): boolean {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function normalizeDotPathSegments(value: string): string {
  const normalized =
    process.platform === "win32" ? path.win32.normalize(value) : path.posix.normalize(value);
  return normalizeMatchTarget(normalized);
}

function escapeRegExpLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileGlobRegex(pattern: string): RegExp {
  const cacheKey = `${process.platform}:${pattern}`;
  const cached = globRegexCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      const next = pattern[i + 1];
      if (next === "*") {
        regex += ".*";
        i += 2;
        continue;
      }
      regex += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      regex += "[^/]";
      i += 1;
      continue;
    }
    regex += escapeRegExpLiteral(ch);
    i += 1;
  }
  regex += "$";

  const compiled = new RegExp(regex, process.platform === "win32" ? "i" : "");
  if (globRegexCache.size >= GLOB_REGEX_CACHE_LIMIT) {
    globRegexCache.clear();
  }
  globRegexCache.set(cacheKey, compiled);
  return compiled;
}

export function matchesExecAllowlistPattern(pattern: string, target: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return false;
  }

  const expanded = trimmed.startsWith("~") ? expandHomePrefix(trimmed) : trimmed;
  const hasWildcard = /[*?]/.test(expanded);
  let normalizedPattern = expanded;
  let normalizedTarget = target;
  if (process.platform === "win32" && !hasWildcard) {
    normalizedPattern = tryRealpath(expanded) ?? expanded;
    normalizedTarget = tryRealpath(target) ?? target;
  }
  normalizedPattern = normalizeMatchTarget(normalizedPattern);
  normalizedTarget = normalizeMatchTarget(normalizedTarget);
  if (hasWildcard && hasDotPathSegment(normalizedTarget)) {
    normalizedTarget = normalizeDotPathSegments(normalizedTarget);
  }
  return compileGlobRegex(normalizedPattern).test(normalizedTarget);
}
