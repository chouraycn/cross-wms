/**
 * Transcript 工具调用检查辅助 — 由会话文件系统视图与使用量指标共享使用
 *
 * 将 provider 专用的块别名集中管理，使两端的工具调用分类保持一致。
 *
 * 参考 openclaw/src/utils/transcript-tools.ts
 */
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "./string-coerce.js";

type ToolResultCounts = {
  total: number;
  errors: number;
};

// Transcript provider 对工具调用块的拼写有分歧；将接受的别名集中，
// 使展示和指标代码对相同的载荷分类一致。
const TOOL_CALL_TYPES = new Set(["tool_use", "toolcall", "tool_call"]);
const TOOL_RESULT_TYPES = new Set(["tool_result", "tool_result_error"]);

const normalizeType = (value: unknown): string => {
  return typeof value === "string" ? (normalizeOptionalLowercaseString(value) ?? "") : "";
};

/** 从直接字段和结构化内容块中提取去重后的工具名 */
export const extractToolCallNames = (message: Record<string, unknown>): string[] => {
  const names = new Set<string>();
  const toolNameRaw = message.toolName ?? message.tool_name;
  const toolName =
    typeof toolNameRaw === "string" ? normalizeOptionalString(toolNameRaw) : undefined;
  if (toolName) {
    names.add(toolName);
  }

  const content = message.content;
  if (!Array.isArray(content)) {
    return Array.from(names);
  }

  for (const entry of content) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const block = entry as Record<string, unknown>;
    const type = normalizeType(block.type);
    if (!TOOL_CALL_TYPES.has(type)) {
      continue;
    }
    const name = typeof block.name === "string" ? normalizeOptionalString(block.name) : undefined;
    if (name) {
      names.add(name);
    }
  }

  return Array.from(names);
};

/** 返回 transcript 消息是否包含任意已识别的工具调用标记 */
export const hasToolCall = (message: Record<string, unknown>): boolean =>
  extractToolCallNames(message).length > 0;

/** 统计已识别的工具结果块以及显式标记为错误的子集 */
export const countToolResults = (message: Record<string, unknown>): ToolResultCounts => {
  const content = message.content;
  if (!Array.isArray(content)) {
    return { total: 0, errors: 0 };
  }

  let total = 0;
  let errors = 0;
  for (const entry of content) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const block = entry as Record<string, unknown>;
    const type = normalizeType(block.type);
    if (!TOOL_RESULT_TYPES.has(type)) {
      continue;
    }
    total += 1;
    if (block.is_error === true) {
      errors += 1;
    }
  }

  return { total, errors };
};
