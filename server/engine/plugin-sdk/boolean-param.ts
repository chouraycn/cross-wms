/**
 * 布尔参数读取 — 从工具输入中解析可能为字符串的布尔标志
 *
 * 接受 true/false 布尔值或 "true"/"false" 字符串（不区分大小写）。
 *
 * 参考 openclaw/src/plugin-sdk/boolean-param.ts
 */

import { normalizeOptionalLowercaseString } from '../infra/string-coerce.js';

/**
 * 从工具参数中读取松散的布尔值，可能输入为布尔值或 "true"/"false" 字符串。
 *
 * 输入无法识别时返回 undefined，调用方自行决定默认行为。
 */
export function readBooleanParam(
  params: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const raw = params[key];
  if (typeof raw === 'boolean') {
    return raw;
  }
  const normalized = normalizeOptionalLowercaseString(raw);
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return undefined;
}
