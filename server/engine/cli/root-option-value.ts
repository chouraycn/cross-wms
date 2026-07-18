// 共享的根选项解析器：处理以 `--flag=value` 或 `--flag value` 形式传递的根选项。
import { isValueToken } from "./cli-root-options.js";
import { parseInlineOptionToken } from "./inline-option-token.js";

/** 返回规范化后的选项值，以及是否消费了下一个 argv token。 */
export function takeCliRootOptionValue(
  raw: string,
  next: string | undefined,
): {
  value: string | null;
  consumedNext: boolean;
} {
  const parsed = parseInlineOptionToken(raw);
  if (parsed.hasInlineValue) {
    const trimmed = (parsed.inlineValue ?? "").trim();
    return { value: trimmed || null, consumedNext: false };
  }
  const consumedNext = isValueToken(next);
  const trimmed = consumedNext ? next!.trim() : "";
  return { value: trimmed || null, consumedNext };
}
