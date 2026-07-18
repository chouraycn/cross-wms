// Reasoning effort 工具：将 provider thinking 控制映射为运行时级别
import type { ThinkLevel } from "../../../auto-reply/types.js";

/** OpenAI 兼容 provider 接受的 reasoning-effort 值 */
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** 将 ThinkLevel 映射为 provider 的 reasoning-effort 标签 */
export function mapThinkingLevelToReasoningEffort(thinkingLevel: ThinkLevel): ReasoningEffort {
  if (thinkingLevel === "off") {
    return "none";
  }
  if (thinkingLevel === "max") {
    return "xhigh";
  }
  return thinkingLevel;
}
