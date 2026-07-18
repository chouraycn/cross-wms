/**
 * 判断给定 block 是否为 thinking 系列块。
 * 兼容 Anthropic 的 `thinking` 与 `redacted_thinking` 类型。
 */
export function isThinkingLikeBlock(block: unknown): boolean {
  if (!block || typeof block !== "object") {
    return false;
  }
  const type = (block as { type?: unknown }).type;
  return type === "thinking" || type === "redacted_thinking";
}
