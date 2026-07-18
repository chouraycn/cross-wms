/**
 * 可执行 token 规范化 — 用于 wrapper 与策略分析
 *
 * 参考 openclaw/src/infra/exec-wrapper-tokens.ts
 */
import path from "node:path";
import { normalizeOptionalLowercaseString } from "./string-coerce.js";

const WINDOWS_EXECUTABLE_SUFFIXES = [".exe", ".cmd", ".bat", ".com"] as const;

function stripWindowsExecutableSuffix(value: string): string {
  for (const suffix of WINDOWS_EXECUTABLE_SUFFIXES) {
    if (value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  return normalizeOptionalLowercaseString(value) ?? "";
}

/** 返回小写 basename，使用更短的 POSIX/Windows 解释 */
export function basenameLower(token: string): string {
  const win = path.win32.basename(token);
  const posix = path.posix.basename(token);
  const base = win.length < posix.length ? win : posix;
  return normalizeLowercaseStringOrEmpty(base);
}

/** 规范化可执行 token，用于 wrapper 与策略匹配 */
export function normalizeExecutableToken(token: string): string {
  return stripWindowsExecutableSuffix(basenameLower(token));
}
