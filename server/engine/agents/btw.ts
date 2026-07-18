/**
 * "by the way" 附带消息机制
 *
 * 用于在主任务执行过程中附带传递侧问题或备注信息，
 * 与主任务流程解耦，便于在 agent 对话中插入临时性的旁路消息。
 *
 * 与 openclaw/src/agents/btw.ts 中需要 LLM 集成的完整 side-question 路径不同，
 * 本模块仅提供消息的数据结构与格式化能力，不涉及模型调用。
 *
 * 参考自 openclaw/src/agents/btw.ts。
 */
import { randomUUID } from 'node:crypto';
import { logger } from '../../logger.js';

/** BTW 消息附带的上下文信息（任意键值对，用于溯源或元数据记录）。 */
export type BtwContext = Record<string, unknown>;

/** "by the way" 附带消息。 */
export interface BtwMessage {
  /** 消息唯一标识。 */
  id: string;
  /** 消息正文内容。 */
  content: string;
  /** 附带的上下文信息（可选）。 */
  context?: BtwContext;
  /** 创建时间戳（毫秒）。 */
  createdAt: number;
}

/**
 * 创建一条 BTW 消息。
 * @param content 消息正文
 * @param context 附带的上下文信息（可选）
 * @throws 当 content 为空字符串时抛出 Error
 */
export function createBtwMessage(content: string, context?: BtwContext): BtwMessage {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('createBtwMessage requires a non-empty content string.');
  }
  return {
    id: randomUUID(),
    content,
    ...(context !== undefined && Object.keys(context).length > 0 ? { context } : {}),
    createdAt: Date.now(),
  };
}

/**
 * 将 BTW 消息格式化为可读字符串。
 *
 * 格式示例：
 *   [BTW] 这是一条附带消息
 *   [BTW] 这是一条附带消息 {key=value}
 *
 * 当消息附带上下文时，会将键值对追加在末尾。
 * @param msg BTW 消息
 */
export function formatBtwMessage(msg: BtwMessage): string {
  const prefix = '[BTW]';
  const content = msg.content.trim();
  if (!msg.context || Object.keys(msg.context).length === 0) {
    return `${prefix} ${content}`;
  }
  const contextPairs = Object.entries(msg.context)
    .map(([key, value]) => `${key}=${formatContextValue(value)}`)
    .join(' ');
  return `${prefix} ${content} {${contextPairs}}`;
}

/** 将上下文值格式化为字符串，对象/数组使用 JSON 序列化。 */
function formatContextValue(value: unknown): string {
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

logger.debug('[Agents:Btw] Module loaded');
