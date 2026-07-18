/**
 * JSON 解析兼容 — 优先使用严格 JSON，回退到 JSON5 以支持注释和尾随逗号
 * 参考 openclaw/src/utils/parse-json-compat.ts
 */

import JSON5 from "json5";

export function parseJsonWithJson5Fallback(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON5.parse(raw);
  }
}