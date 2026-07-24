/**
 * 字符串处理工具函数
 *
 * 移植自 openclaw/src/utils.ts（sliceUtf16Safe / truncateUtf16Safe / normalizeE164）。
 * 原实现为纯函数，无外部依赖，此处保持等价语义。
 */

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

/**
 * 按 UTF-16 代码单元切片字符串，避免在任一边界返回悬空的代理项半边。
 *
 * @source openclaw/src/utils.ts → sliceUtf16Safe
 * @param input 原始字符串
 * @param start 起始索引（支持负数，语义同 String.prototype.slice）
 * @param end 结束索引（可选，支持负数）
 * @returns 切片后的字符串，不会落在代理对中间
 */
export function sliceUtf16Safe(input: string, start: number, end?: number): string {
  const len = input.length;

  let from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  let to = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);

  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  if (from > 0 && from < len) {
    const codeUnit = input.charCodeAt(from);
    if (isLowSurrogate(codeUnit) && isHighSurrogate(input.charCodeAt(from - 1))) {
      from += 1;
    }
  }

  if (to > 0 && to < len) {
    const codeUnit = input.charCodeAt(to - 1);
    if (isHighSurrogate(codeUnit) && isLowSurrogate(input.charCodeAt(to))) {
      to -= 1;
    }
  }

  return input.slice(from, to);
}

/**
 * 截断 UTF-16 字符串，避免在代理对中间切断。
 *
 * @source openclaw/src/utils.ts → truncateUtf16Safe
 * @param input 原始字符串
 * @param maxLen 最大长度（UTF-16 代码单元数）
 * @returns 截断后的字符串
 */
export function truncateUtf16Safe(input: string, maxLen: number): string {
  const limit = Math.max(0, Math.floor(maxLen));
  if (input.length <= limit) {
    return input;
  }
  return sliceUtf16Safe(input, 0, limit);
}

/**
 * 将类电话输入规范化为 channel 辅助函数使用的宽松 E.164 形式。
 * 去除 `scheme:` 前缀与非数字字符，保证以 `+` 开头。
 *
 * @source openclaw/src/utils.ts → normalizeE164
 * @param number 原始号码字符串（可能带 tel: 等前缀）
 * @returns 以 `+` 开头的 E.164 风格字符串
 */
export function normalizeE164(number: string): string {
  const withoutPrefix = number.replace(/^[a-z][a-z0-9-]*:/i, "").trim();
  const digits = withoutPrefix.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return `+${digits.slice(1)}`;
  }
  return `+${digits}`;
}
