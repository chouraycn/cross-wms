/**
 * Compaction Sanitize - 工具结果脱敏
 *
 * 在摘要前移除敏感信息，确保安全
 */
import type { AgentMessage } from './context-engine/types.js';
import { logger } from '../logger.js';

/**
 * 工具结果详情（需要脱敏）
 */
interface _ToolResultDetails {
  [key: string]: unknown;
  // 常见敏感字段
  data?: unknown;
  response?: unknown;
  result?: unknown;
  content?: unknown;
}

/**
 * 工具调用结构
 */
interface ToolCall {
  id?: string;
  type?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * 检测消息是否为工具结果
 */
function isToolResult(message: AgentMessage): boolean {
  return message.role === 'tool' && Boolean(message.toolCallId);
}

/**
 * 检测消息是否包含工具调用
 */
function hasToolCalls(message: AgentMessage): boolean {
  return (
    message.role === 'assistant' &&
    Boolean(message.toolCalls && message.toolCalls.length > 0)
  );
}

/**
 * 移除工具结果中的敏感详情
 *
 * SECURITY: tool_result.details 包含大量可能泄露的内部信息，
 * 绝对不能进入 LLM 摘要
 */
export function stripToolResultDetails(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(message => {
    if (!isToolResult(message)) {
      return message;
    }

    // 如果 content 不是对象或没有 metadata，返回原消息
    if (typeof message.content !== 'object' || message.content === null) {
      return message;
    }

    // 克隆消息，避免修改原对象
    const sanitized = { ...message };

    // 清理 content 中的敏感字段
    if (typeof sanitized.content === 'object' && sanitized.content !== null) {
      const content = sanitized.content as Record<string, unknown>;
      const sanitizedContent: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(content)) {
        // 跳过敏感字段
        if (isSensitiveField(key)) {
          sanitizedContent[key] = '[REDACTED]';
        } else {
          sanitizedContent[key] = value;
        }
      }

      sanitized.content = JSON.stringify(sanitizedContent);
    }

    return sanitized;
  });
}

/**
 * 检测是否为敏感字段
 */
function isSensitiveField(fieldName: string): boolean {
  const sensitivePatterns = [
    'password', 'passwd', 'secret', 'token', 'api_key', 'apikey',
    'auth', 'credential', 'private', 'key', 'token',
    'bearer', 'jwt', 'session',
    'data', 'response', 'result', 'output',
  ];

  const lower = fieldName.toLowerCase();
  return sensitivePatterns.some(pattern => lower.includes(pattern));
}

/**
 * 移除运行时上下文消息
 *
 * SECURITY: runtime-context transcript entries 是内部状态，
 * 不应该暴露给 LLM 摘要
 */
export function stripRuntimeContextMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter(message => {
    // 检测是否为运行时上下文消息
    if (isRuntimeContextMessage(message)) {
      logger.debug('[CompactionSanitize] Stripped runtime context message');
      return false;
    }
    return true;
  });
}

/**
 * 检测是否为运行时上下文消息
 */
function isRuntimeContextMessage(message: AgentMessage): boolean {
  // 检查 role
  if (message.role === 'runtime' || message.role === 'system-internal') {
    return true;
  }

  // 检查 metadata 中的运行时标记
  if (message.metadata) {
    const meta = message.metadata as Record<string, unknown>;
    if (meta._runtimeContext || meta._internal) {
      return true;
    }
  }

  // 检查 content 是否为特殊格式
  if (typeof message.content === 'string') {
    // 运行时上下文通常有特定前缀
    if (message.content.startsWith('[RUNTIME:') || message.content.startsWith('[INTERNAL:')) {
      return true;
    }
  }

  return false;
}

/**
 * 综合清理压缩消息
 *
 * SECURITY: 应用所有安全过滤
 */
export function sanitizeCompactionMessages(messages: AgentMessage[]): AgentMessage[] {
  // 1. 先移除运行时上下文消息
  let safe = stripRuntimeContextMessages(messages);

  // 2. 再清理工具结果详情
  safe = stripToolResultDetails(safe);

  return safe;
}

/**
 * 估算清理后的消息 token 数
 */
export function estimateSanitizedMessagesTokens(messages: AgentMessage[]): number {
  const safe = sanitizeCompactionMessages(messages);
  return safe.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * 估算单条消息 token 数
 */
function estimateMessageTokens(message: AgentMessage): number {
  let chars = 0;

  if (typeof message.content === 'string') {
    chars += message.content.length;
  } else if (typeof message.content === 'object') {
    chars += JSON.stringify(message.content).length;
  }

  // toolCalls 的 overhead
  if (message.toolCalls && message.toolCalls.length > 0) {
    chars += 50; // 固定 overhead
  }

  // role 的 overhead
  chars += 10;

  return Math.ceil(chars / 4);
}

/**
 * 工具对配对信息
 */
export interface ToolPairInfo {
  toolCallId: string;
  toolCallMessage: AgentMessage;
  toolResultMessage?: AgentMessage;
  isComplete: boolean;
}

/**
 * 从消息列表提取工具对
 */
export function extractToolPairs(messages: AgentMessage[]): ToolPairInfo[] {
  const pairs: Map<string, ToolPairInfo> = new Map();
  const orphanResults: AgentMessage[] = [];

  for (const message of messages) {
    if (hasToolCalls(message)) {
      for (const tc of message.toolCalls as ToolCall[]) {
        if (tc && tc.id) {
          pairs.set(tc.id, {
            toolCallId: tc.id,
            toolCallMessage: message,
            isComplete: false,
          });
        }
      }
    } else if (isToolResult(message) && message.toolCallId) {
      const pair = pairs.get(message.toolCallId);
      if (pair) {
        pair.toolResultMessage = message;
        pair.isComplete = true;
      } else {
        orphanResults.push(message);
      }
    }
  }

  return Array.from(pairs.values());
}

/**
 * 修复孤儿工具结果
 *
 * 当工具调用的结果被丢弃时，相应地处理其工具结果
 */
export function repairOrphanToolResults(
  keptMessages: AgentMessage[],
  _droppedMessages: AgentMessage[],
): { messages: AgentMessage[]; orphanedCount: number } {
  // 获取保留消息中的工具调用 ID
  const keptToolCallIds = new Set<string>();
  for (const msg of keptMessages) {
    if (hasToolCalls(msg)) {
      for (const tc of msg.toolCalls as ToolCall[]) {
        if (tc && tc.id) {
          keptToolCallIds.add(tc.id);
        }
      }
    }
  }

  // 过滤掉孤儿工具结果
  const kept: AgentMessage[] = [];
  let orphanedCount = 0;

  for (const msg of keptMessages) {
    if (isToolResult(msg) && msg.toolCallId && !keptToolCallIds.has(msg.toolCallId)) {
      // 这是一个孤儿工具结果（其工具调用已被丢弃）
      orphanedCount++;
      logger.debug(`[CompactionSanitize] Removing orphan tool result: ${msg.toolCallId}`);
      // 不添加到 kept 列表
    } else {
      kept.push(msg);
    }
  }

  return { messages: kept, orphanedCount };
}

/**
 * 验证消息列表完整性
 */
export function validateMessageIntegrity(messages: AgentMessage[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg.role) {
      errors.push(`message_at_index_${i}_missing_role`);
    }

    if (msg.content === undefined || msg.content === null) {
      // content 可以是空字符串，但不能是 undefined/null
      if (typeof msg.content !== 'string') {
        errors.push(`message_at_index_${i}_invalid_content`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
