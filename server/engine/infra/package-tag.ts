// 规范化 install/update 流程中的 package tag 输入。
import { normalizeOptionalString } from "./string-coerce.js";

/** 规范化 package tag 输入，当存在已知包名前缀时去除前缀 */
export function normalizePackageTagInput(
  value: string | undefined | null,
  packageNames: readonly string[],
): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return null;
  }

  for (const packageName of packageNames) {
    if (trimmed === packageName) {
      return null;
    }
    const prefix = `${packageName}@`;
    if (trimmed.startsWith(prefix)) {
      const tag = trimmed.slice(prefix.length).trim();
      return tag ? tag : null;
    }
  }

  return trimmed;
}
