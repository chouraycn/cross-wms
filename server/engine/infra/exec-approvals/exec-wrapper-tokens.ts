// 规范化 wrapper 与策略分析使用的可执行 token
import path from "node:path";
import { normalizeLowercaseStringOrEmpty } from "../string-coerce.js";

const WINDOWS_EXECUTABLE_SUFFIXES = [".exe", ".cmd", ".bat", ".com"] as const;

function stripWindowsExecutableSuffix(value: string): string {
  for (const suffix of WINDOWS_EXECUTABLE_SUFFIXES) {
    if (value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

/** 返回使用较短 POSIX/Windows 解释的小写 basename */
export function basenameLower(token: string): string {
  const win = path.win32.basename(token);
  const posix = path.posix.basename(token);
  const base = win.length < posix.length ? win : posix;
  return normalizeLowercaseStringOrEmpty(base);
}

/** 规范化可执行 token 用于 wrapper 与策略匹配 */
export function normalizeExecutableToken(token: string): string {
  return stripWindowsExecutableSuffix(basenameLower(token));
}
