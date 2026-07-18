// Gateway JSON 解析辅助。
// 安全解析可选 JSON 负载，同时在解析失败时保留原始负文本。
// 移植自 openclaw/src/gateway/server-json.ts。
// 依赖调整：@openclaw/normalization-core/string-coerce → ../infra/string-coerce.js
import { normalizeOptionalString } from "../infra/string-coerce.js";

/** 安全解析可选 JSON 字符串，解析失败时返回 payloadJSON 包装对象。 */
export function safeParseJson(value: string | null | undefined): unknown {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { payloadJSON: value };
  }
}
