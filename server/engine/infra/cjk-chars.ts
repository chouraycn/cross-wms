/**
 * CJK 字符计数 — 用于准确的 Token 估算
 *
 * 多数 LLM 分词器对 CJK（中文、日文、韩文）字符大约 1 个字符对应 1 个 Token，
 * 而 Latin/ASCII 文本平均约 4 个字符对应 1 个 Token。当字符数除以 4 来估算
 * Token 数时，CJK 文本会被低估 2~4 倍。
 *
 * 本模块提供共享辅助函数：将 CJK 文本的字符数膨胀，使得标准的
 * `chars / 4` 公式对任意脚本都能给出较准确的 Token 估算。
 *
 * 参考 openclaw/src/utils/cjk-chars.ts
 */

/**
 * 代码库中默认的每 Token 字符数比例。
 * Latin 文本 ≈ 4 字符/Token；CJK ≈ 1 字符/Token。
 */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * 匹配 CJK 统一表意文字、CJK 扩展 A/B、CJK 兼容表意文字、
 * 韩文音节、平假名、片假名以及其他通常约 1 字符对应 1 Token 的非拉丁脚本。
 */
const NON_LATIN_RE = /[\u2E80-\u9FFF\uA000-\uA4FF\uAC00-\uD7AF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/gu;

/**
 * 返回考虑了非拉丁（CJK 等）字符的调整后字符长度。
 * 每个非拉丁字符记为 {@link CHARS_PER_TOKEN_ESTIMATE} 个字符，
 * 使得下游 `chars / CHARS_PER_TOKEN_ESTIMATE` 的 Token 估算保持准确。
 *
 * 对于纯 ASCII/Latin 文本，返回值等于 `text.length`（无变化）。
 */
export function estimateStringChars(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const nonLatinCount = (text.match(NON_LATIN_RE) ?? []).length;
  // 使用码点长度而非 UTF-16 长度，使得代理对（CJK 扩展 B+，U+20000–U+2FA1F）
  // 被计为 1 个字符而非 2 个。
  const codePointLength = countCodePoints(text, nonLatinCount);
  // 非拉丁字符已经在 codePointLength 中贡献了 1，所以加上额外的权重。
  return codePointLength + nonLatinCount * (CHARS_PER_TOKEN_ESTIMATE - 1);
}

/**
 * 匹配码点落在 CJK 扩展 B+ 范围（U+20000–U+2FA1F）内的代理对。
 * 只有这些代理对需要调整，因为它们被 {@link NON_LATIN_RE} 匹配并已计入
 * `nonLatinCount`。其他代理对（emoji、符号）不被该正则匹配，
 * 折叠它们会造成不一致。
 *
 * U+20000–U+2FA1F 的高代理范围是 D840–D87E。
 */
const CJK_SURROGATE_HIGH_RE = /[\uD840-\uD87E][\uDC00-\uDFFF]/g;

/**
 * 返回字符串的码点感知长度，仅对 CJK 扩展 B+ 代理对进行调整。
 * 对于不含此类字符的文本（绝大多数输入），返回 `text.length` 不变。
 */
function countCodePoints(text: string, nonLatinCount: number): number {
  if (nonLatinCount === 0) {
    return text.length;
  }
  // 仅统计 CJK 范围代理对 — 每个占据 2 个 UTF-16 单元但代表 1 个码点
  // （且在 NON_LATIN_RE 中匹配 1 次）。
  const cjkSurrogates = (text.match(CJK_SURROGATE_HIGH_RE) ?? []).length;
  return text.length - cjkSurrogates;
}

/**
 * 从原始字符数估算 Token 数。
 *
 * 若有源文本可用，更准确的估算是 `estimateStringChars(text) / CHARS_PER_TOKEN_ESTIMATE`。
 */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / CHARS_PER_TOKEN_ESTIMATE);
}
