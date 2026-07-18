/**
 * 密钥输入规范化 — 处理复制粘贴的凭证
 *
 * 常见陷阱：API key/Token 中嵌入的换行符（尤其是 `\r`）。
 * 此处先去除任意位置的换行符，再去掉首尾空白。
 *
 * 另一个常见运行时失败源：粘贴到 API key 中的富文本/Unicode
 * 字符（智能标点、制表符等），可能破坏 HTTP 头构造（`ByteString` 违规）。
 * 丢弃非 Latin1 码点，使畸形 key 以认证错误失败而非崩溃请求构造。
 *
 * 故意不移除字符串内部的普通空格，以避免静默改变 "Bearer <token>" 形式的值。
 *
 * 参考 openclaw/src/utils/normalize-secret-input.ts
 */

/**
 * 规范化来自 config、env、setup 提示或 plugin SDK 调用方的原始密钥值。
 * 输入缺失/无效时返回空字符串，便于调用方保持布尔存在性检查。
 */
export function normalizeSecretInput(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const collapsed = value.replace(/[\r\n\u2028\u2029]+/g, "");
  const chars: string[] = [];
  for (const char of collapsed) {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint === "number" && codePoint <= 0xff) {
      chars.push(char);
    }
  }
  return chars.join("").trim();
}

/**
 * 规范化原始密钥值，并将空的规范化输出转为 `undefined`。
 * 在 "未配置" 比空字符串更清晰的可选配置边界使用。
 */
export function normalizeOptionalSecretInput(value: unknown): string | undefined {
  const normalized = normalizeSecretInput(value);
  return normalized || undefined;
}
