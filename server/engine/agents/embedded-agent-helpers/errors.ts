/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/errors.ts
 *
 * 简化版：仅包含 isReasoningConstraintErrorMessage。
 * 完整的 errors.ts 模块（1767 行）负责分类 provider/runtime 失败并格式化
 * assistant 面向的错误文本，依赖较深，此处仅提取被 thinking.ts 引用的核心函数。
 */
import { normalizeLowercaseStringOrEmpty } from "../../infra/string-coerce.js";

/** Detect provider errors that require reasoning to stay enabled. */
export function isReasoningConstraintErrorMessage(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const lower = normalizeLowercaseStringOrEmpty(raw);
  return (
    lower.includes("reasoning is mandatory") ||
    lower.includes("reasoning is required") ||
    lower.includes("requires reasoning") ||
    (lower.includes("reasoning") && lower.includes("cannot be disabled"))
  );
}
