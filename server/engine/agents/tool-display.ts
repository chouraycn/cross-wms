/**
 * 工具调用显示格式化
 *
 * 提供 agent 工具调用与结果的统一显示格式化能力，
 * 包括工具调用信息拼接、结果序列化与输出截断。
 *
 * 参考自 openclaw/src/agents/tool-display.ts。
 */
import { logger } from '../../logger.js';

/** truncateToolOutput 的默认最大长度。 */
const DEFAULT_MAX_OUTPUT_LENGTH = 200;

/** 截断后追加的省略标记。 */
const TRUNCATE_SUFFIX = '...';

/**
 * 格式化工具调用为可读字符串。
 *
 * 格式示例：
 *   [Tool] toolName(args)
 *   [Tool] toolName(args) => result
 *
 * args 与 result 会被序列化为紧凑 JSON，并按需截断。
 *
 * @param toolName 工具名称
 * @param args 工具调用参数
 * @param result 工具调用结果（可选）
 */
export function formatToolCall(
  toolName: string,
  args: unknown,
  result?: unknown,
): string {
  const name = typeof toolName === 'string' && toolName ? toolName : 'unknown';
  const argsStr = formatValue(args);
  const base = `[Tool] ${name}(${argsStr})`;
  if (result === undefined) {
    return base;
  }
  const resultStr = formatValue(result);
  return `${base} => ${resultStr}`;
}

/**
 * 格式化工具结果为可读字符串。
 *
 * 字符串原样返回（按需截断），其他类型序列化为 JSON。
 * @param result 工具调用结果
 */
export function formatToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return formatValue(result);
}

/**
 * 截断工具输出文本，超出最大长度时尾部追加省略标记。
 *
 * @param text 待截断的文本
 * @param maxLength 最大长度，默认 200
 */
export function truncateToolOutput(text: string, maxLength?: number): string {
  if (typeof text !== 'string') {
    return '';
  }
  const limit = typeof maxLength === 'number' && maxLength > 0
    ? maxLength
    : DEFAULT_MAX_OUTPUT_LENGTH;
  if (text.length <= limit) {
    return text;
  }
  // 预留省略标记的长度
  const budget = Math.max(limit - TRUNCATE_SUFFIX.length, 0);
  return text.slice(0, budget) + TRUNCATE_SUFFIX;
}

/** 将任意值序列化为紧凑字符串，对象/数组使用 JSON。 */
function formatValue(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

logger.debug('[Agents:ToolDisplay] Module loaded');
