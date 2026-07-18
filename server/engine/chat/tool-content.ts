/**
 * 工具调用内容呈现
 *
 * 规范化工具结果内容以用于聊天记录渲染，
 * 支持多种提供商的工具调用和结果格式。
 */

import type { ToolContentBlock, ToolCallContent, ToolResultContent } from './types.js';

const TOOL_USE_ID_FIELDS = [
  'id',
  'tool_call_id',
  'toolCallId',
  'tool_use_id',
  'toolUseId',
] as const;
type ToolUseIdField = (typeof TOOL_USE_ID_FIELDS)[number];

function normalizeToolContentType(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * 判断内容类型是否为工具调用类型。
 * 支持多种提供商 SDK 的命名。
 */
export function isToolCallContentType(value: unknown): boolean {
  const type = normalizeToolContentType(value);
  return type === 'toolcall' || type === 'tool_call' || type === 'tooluse' || type === 'tool_use';
}

/**
 * 判断内容类型是否为工具结果类型。
 * 支持多种提供商 SDK 的命名。
 */
export function isToolResultContentType(value: unknown): boolean {
  const type = normalizeToolContentType(value);
  return type === 'toolresult' || type === 'tool_result';
}

/**
 * 判断内容块是否为工具调用块。
 */
export function isToolCallBlock(block: ToolContentBlock): boolean {
  return isToolCallContentType(block.type);
}

/**
 * 判断内容块是否为工具结果块。
 */
export function isToolResultBlock(block: ToolContentBlock): boolean {
  return isToolResultContentType(block.type);
}

/**
 * 从工具块中读取参数。
 * 支持多种提供商的字段命名。
 */
export function resolveToolBlockArgs(block: ToolContentBlock): unknown {
  return block.args ?? block.arguments ?? block.input;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 从工具块中读取稳定的 tool-use id。
 * 支持 snake_case 和 camelCase 命名。
 */
export function resolveToolUseId(block: ToolContentBlock): string | undefined {
  for (const field of TOOL_USE_ID_FIELDS) {
    const id = normalizeOptionalString(block[field as keyof ToolContentBlock]);
    if (id) {
      return id;
    }
  }
  return undefined;
}

/**
 * 从工具调用块提取标准化的工具调用内容。
 */
export function extractToolCall(block: ToolContentBlock): ToolCallContent | undefined {
  if (!isToolCallBlock(block)) {
    return undefined;
  }

  const id = resolveToolUseId(block);
  const name = typeof block.name === 'string' ? block.name : undefined;
  const args = resolveToolBlockArgs(block);

  return {
    id,
    name,
    args,
  };
}

/**
 * 从工具结果块提取标准化的工具结果内容。
 */
export function extractToolResult(block: ToolContentBlock): ToolResultContent | undefined {
  if (!isToolResultBlock(block)) {
    return undefined;
  }

  const toolCallId = resolveToolUseId(block);
  const content = block.content;
  const isError = block.isError === true;

  return {
    toolCallId,
    content,
    isError,
  };
}

/**
 * 从内容块列表中提取所有工具调用。
 */
export function extractToolCalls(blocks: ToolContentBlock[]): ToolCallContent[] {
  const results: ToolCallContent[] = [];
  for (const block of blocks) {
    const call = extractToolCall(block);
    if (call) {
      results.push(call);
    }
  }
  return results;
}

/**
 * 从内容块列表中提取所有工具结果。
 */
export function extractToolResults(blocks: ToolContentBlock[]): ToolResultContent[] {
  const results: ToolResultContent[] = [];
  for (const block of blocks) {
    const result = extractToolResult(block);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

/**
 * 将工具调用格式化为可读文本。
 */
export function formatToolCall(call: ToolCallContent): string {
  const name = call.name ?? 'unknown_tool';
  const argsStr = call.args ? JSON.stringify(call.args, null, 2) : '';
  return `\`\`\`tool:${name}\n${argsStr}\n\`\`\``;
}

/**
 * 将工具结果格式化为可读文本。
 */
export function formatToolResult(result: ToolResultContent): string {
  const content = result.content;
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (content !== undefined && content !== null) {
    text = JSON.stringify(content, null, 2);
  } else {
    text = '';
  }

  const prefix = result.isError ? '[error] ' : '';
  return `${prefix}${text}`;
}
