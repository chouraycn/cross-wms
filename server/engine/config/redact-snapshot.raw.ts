// 移植自 openclaw/src/config/redact-snapshot.raw.ts
// 对原始配置快照文本应用低层脱敏变换。
//
// 降级说明：源文件依赖 @openclaw/normalization-core/string-normalization 的 uniqueStrings。
// cross-wms 未引入该包，此处内联一个等价的去重实现。

import { isDeepStrictEqual } from "node:util";
import JSON5 from "json5";

/** 内联降级实现：保留首次出现的字符串，去除重复项。 */
function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/** Replaces known sensitive values in raw config text while preserving parseable structure. */
export function replaceSensitiveValuesInRaw(params: {
  raw: string;
  sensitiveValues: string[];
  redactedSentinel: string;
}): string {
  // Empty string is not a valid replacement token here: replaceAll("", x)
  // matches every character boundary and corrupts the whole raw snapshot.
  const values = uniqueStrings(params.sensitiveValues)
    .filter((value) => value !== "")
    .toSorted((a, b) => b.length - a.length);
  let result = params.raw;
  for (const value of values) {
    // Replace longer overlapping values first so a short prefix cannot hide the full secret.
    result = result.replaceAll(value, params.redactedSentinel);
  }
  return result;
}

/** Returns whether raw string redaction changed semantics and structured redaction is needed. */
export function shouldFallbackToStructuredRawRedaction(params: {
  redactedRaw: string;
  originalConfig: unknown;
  restoreParsed: (parsed: unknown) => { ok: boolean; result?: unknown };
}): boolean {
  try {
    const parsed = JSON5.parse(params.redactedRaw);
    const restored = params.restoreParsed(parsed);
    if (!restored.ok) {
      return true;
    }
    // Raw replacement is only safe when parsing and restoring produces the original config shape.
    return !isDeepStrictEqual(restored.result, params.originalConfig);
  } catch {
    return true;
  }
}
