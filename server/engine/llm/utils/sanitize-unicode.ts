/**
 * 移除字符串中未配对的 Unicode 代理字符。
 *
 * 未配对代理（高代理 0xD800-0xDBFF 没有匹配的低代理 0xDC00-0xDFFF，
 * 或反之）在许多 API provider 中会导致 JSON 序列化错误。
 *
 * 基本多语言平面之外的有效 emoji 和其他字符使用正确配对的代理，
 * 不会受此函数影响。
 *
 * @param text - 要净化的文本
 * @returns 移除未配对代理后的净化文本
 *
 * @example
 * // 有效 emoji（正确配对的代理）被保留
 * sanitizeSurrogates("Hello 🙈 World") // => "Hello 🙈 World"
 *
 * // 未配对的高代理被移除
 * const unpaired = String.fromCharCode(0xD83D); // 没有低代理的高代理
 * sanitizeSurrogates(`Text ${unpaired} here`) // => "Text  here"
 */
export function sanitizeSurrogates(text: string): string {
  // 替换未配对的高代理（0xD800-0xDBFF 后面不跟低代理）
  // 替换未配对的低代理（0xDC00-0xDFFF 前面不跟高代理）
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}
