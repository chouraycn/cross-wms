/**
 * v1.7.20: 历史消息消毒器
 *
 * 在发送给模型之前，对历史消息进行校验和修复，确保：
 * - 没有连续的用户消息（合并）
 * - 没有空的/失败的助手轮次
 * - tool_calls 和 tool_results 正确配对
 * - 重复用户消息去重
 * - 按轮次截断
 * - 图片附件尺寸限制
 * - tool call 输入规范化
 * - reasoning 内容兼容性处理
 */

import type { ImageSanitizationLimits } from './imageSanitization.js';
import { sanitizeMessageImages } from './imageSanitization.js';

type ApiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
};

type SanitizeOptions = {
  maxTurns?: number;
  dedupeUserMessages?: boolean;
  mergeConsecutiveUsers?: boolean;
  cleanupEmptyAssistants?: boolean;
  validateToolPairs?: boolean;
  sanitizeToolCalls?: boolean;
  sanitizeImages?: boolean;
  imageLimits?: ImageSanitizationLimits;
  dropReasoning?: boolean;
};

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  maxTurns: 0,
  dedupeUserMessages: true,
  mergeConsecutiveUsers: true,
  cleanupEmptyAssistants: true,
  validateToolPairs: true,
  sanitizeToolCalls: true,
  sanitizeImages: true,
  imageLimits: {},
  dropReasoning: false,
};

/**
 * 合并连续的用户消息
 *
 * 大多数模型 API 拒绝连续的 user 消息，需要合并为一条。
 */
function mergeConsecutiveUserMessages(messages: ApiMessage[]): ApiMessage[] {
  if (messages.length <= 1) return messages;

  const result: ApiMessage[] = [];
  for (const msg of messages) {
    const last = result[result.length - 1];

    if (msg.role === 'user' && last && last.role === 'user') {
      // 合并两条用户消息
      if (typeof last.content === 'string' && typeof msg.content === 'string') {
        last.content = last.content + '\n\n' + msg.content;
      } else if (Array.isArray(last.content) && typeof msg.content === 'string') {
        last.content.push({ type: 'text', text: msg.content });
      } else if (typeof last.content === 'string' && Array.isArray(msg.content)) {
        last.content = [{ type: 'text', text: last.content }, ...msg.content];
      } else if (Array.isArray(last.content) && Array.isArray(msg.content)) {
        last.content = [...last.content, ...msg.content];
      }
    } else {
      result.push({ ...msg });
    }
  }

  return result;
}

/**
 * 清理空的/失败的助手轮次
 *
 * 移除没有内容也没有 tool_calls 的助手消息，
 * 以及对应的孤立 tool 结果消息。
 */
function cleanupEmptyAssistantTurns(messages: ApiMessage[]): ApiMessage[] {
  if (messages.length === 0) return messages;

  // 第一步：标记空的 assistant 消息及其后续的 tool 消息
  const toRemove = new Set<number>();
  const orphanToolCallIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant') {
      const hasContent = typeof msg.content === 'string'
        ? msg.content.trim().length > 0
        : Array.isArray(msg.content) && msg.content.length > 0;
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

      if (!hasContent && !hasToolCalls) {
        // 空的助手消息，标记删除
        toRemove.add(i);
        // 收集它的 tool call id（如果有的话）
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            orphanToolCallIds.add(tc.id);
          }
        }
      }
    }

    if (msg.role === 'tool' && msg.tool_call_id && orphanToolCallIds.has(msg.tool_call_id)) {
      toRemove.add(i);
      orphanToolCallIds.delete(msg.tool_call_id);
    }
  }

  // 第二步：过滤掉被标记的消息
  return messages.filter((_, idx) => !toRemove.has(idx));
}

/**
 * 校验和修复 tool call / tool result 配对
 *
 * - 没有对应 tool_call 的 tool_result：移除
 * - 没有对应 tool_result 的 tool_call：补充占位结果或移除 tool_call
 */
function validateToolResultPairs(messages: ApiMessage[]): ApiMessage[] {
  if (messages.length === 0) return messages;

  const activeToolCallIds = new Set<string>();
  const result: ApiMessage[] = [];
  const toolCallMap = new Map<string, number>(); // tool_call_id -> assistant 消息在 result 中的索引

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // 记录所有 tool_call id
      for (const tc of msg.tool_calls) {
        activeToolCallIds.add(tc.id);
        toolCallMap.set(tc.id, result.length);
      }
      result.push({ ...msg });
    } else if (msg.role === 'tool') {
      const toolCallId = msg.tool_call_id || '';
      if (activeToolCallIds.has(toolCallId)) {
        // 有效的 tool result
        activeToolCallIds.delete(toolCallId);
        toolCallMap.delete(toolCallId);
        result.push({ ...msg });
      }
      // 没有对应 tool_call 的 tool_result：直接丢弃
    } else {
      result.push({ ...msg });
    }
  }

  // 处理未配对的 tool_call（有 call 没有 result）
  // 策略：从 assistant 消息中移除未配对的 tool_calls
  for (const [toolCallId, assistantIdx] of toolCallMap) {
    const assistantMsg = result[assistantIdx];
    if (assistantMsg && assistantMsg.tool_calls) {
      assistantMsg.tool_calls = assistantMsg.tool_calls.filter(tc => tc.id !== toolCallId);
      if (assistantMsg.tool_calls.length === 0) {
        delete assistantMsg.tool_calls;
      }
    }
  }

  return result;
}

/**
 * 重复用户消息去重
 *
 * 移除内容完全相同的连续用户消息。
 */
function dedupeUserMessages(messages: ApiMessage[]): ApiMessage[] {
  if (messages.length <= 1) return messages;

  const result: ApiMessage[] = [];
  let lastUserContent = '';

  for (const msg of messages) {
    if (msg.role === 'user') {
      const contentStr = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      const normalized = contentStr.trim();
      if (normalized === lastUserContent && normalized.length > 0) {
        // 重复的用户消息，跳过
        continue;
      }
      lastUserContent = normalized;
    } else {
      // 遇到非用户消息，重置 lastUserContent
      lastUserContent = '';
    }
    result.push({ ...msg });
  }

  return result;
}

/**
 * 按轮次截断历史消息
 *
 * 保留最后 N 个用户轮次及其对应的助手回复。
 * system 消息始终保留。
 */
function limitHistoryTurns(messages: ApiMessage[], maxTurns: number): ApiMessage[] {
  if (maxTurns <= 0 || messages.length === 0) return messages;

  // 分离 system 消息和对话消息
  const systemMessages: ApiMessage[] = [];
  const conversationMessages: ApiMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      conversationMessages.push(msg);
    }
  }

  if (conversationMessages.length === 0) return messages;

  // 从后往前数 user 轮次
  let userCount = 0;
  let startIndex = 0;

  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    if (conversationMessages[i].role === 'user') {
      userCount++;
      if (userCount > maxTurns) {
        startIndex = i + 1;
        break;
      }
    }
  }

  // 如果轮数没超过限制，直接返回
  if (userCount <= maxTurns) return messages;

  const trimmedConversation = conversationMessages.slice(startIndex);
  return [...systemMessages, ...trimmedConversation];
}

/**
 * 规范化 tool call 输入
 *
 * - 清理 tool call name 前后空格
 * - 校验 tool call id 非空
 * - 确保 arguments 是有效的 JSON 字符串
 */
function sanitizeToolCallInputs(messages: ApiMessage[]): ApiMessage[] {
  let touched = false;
  const result: ApiMessage[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.tool_calls || msg.tool_calls.length === 0) {
      result.push(msg);
      continue;
    }

    let msgTouched = false;
    const newToolCalls: typeof msg.tool_calls = [];

    for (const tc of msg.tool_calls) {
      const originalName = tc.function?.name || '';
      const trimmedName = originalName.trim();
      const nameChanged = originalName !== trimmedName;

      let argsValid = true;
      let normalizedArgs = tc.function?.arguments || '{}';
      try {
        const parsed = JSON.parse(normalizedArgs);
        normalizedArgs = JSON.stringify(parsed);
      } catch {
        argsValid = false;
      }

      const idValid = typeof tc.id === 'string' && tc.id.trim().length > 0;

      if (nameChanged || !argsValid || !idValid) {
        msgTouched = true;
        if (!idValid) continue;
        newToolCalls.push({
          ...tc,
          id: tc.id.trim(),
          type: tc.type || 'function',
          function: {
            name: trimmedName,
            arguments: argsValid ? normalizedArgs : '{}',
          },
        });
      } else {
        newToolCalls.push(tc);
      }
    }

    if (msgTouched) {
      touched = true;
      if (newToolCalls.length > 0) {
        result.push({ ...msg, tool_calls: newToolCalls });
      } else {
        const newMsg = { ...msg };
        delete newMsg.tool_calls;
        result.push(newMsg);
      }
    } else {
      result.push(msg);
    }
  }

  return touched ? result : messages;
}

/**
 * 移除或保留 reasoning 内容
 *
 * 当模型不支持推理时，需要从历史消息中移除 reasoning_content，
 * 避免模型 API 报格式错误。
 */
function processReasoningContent(messages: ApiMessage[], dropReasoning: boolean): ApiMessage[] {
  if (!dropReasoning) return messages;

  let touched = false;
  const result: ApiMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.reasoning_content) {
      touched = true;
      const newMsg = { ...msg };
      delete newMsg.reasoning_content;
      result.push(newMsg);
    } else {
      result.push(msg);
    }
  }

  return touched ? result : messages;
}

/**
 * 统一的历史消息消毒入口
 *
 * 在发送给模型之前调用，确保历史消息格式正确。
 */
export function sanitizeHistoryMessages(
  messages: ApiMessage[],
  options: SanitizeOptions = {},
): ApiMessage[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = [...messages];

  // 1. 清理空助手轮次
  if (opts.cleanupEmptyAssistants) {
    result = cleanupEmptyAssistantTurns(result);
  }

  // 2. 校验 tool 配对
  if (opts.validateToolPairs) {
    result = validateToolResultPairs(result);
  }

  // 3. 规范化 tool call 输入
  if (opts.sanitizeToolCalls) {
    result = sanitizeToolCallInputs(result);
  }

  // 4. 重复用户消息去重
  if (opts.dedupeUserMessages) {
    result = dedupeUserMessages(result);
  }

  // 5. 合并连续用户消息
  if (opts.mergeConsecutiveUsers) {
    result = mergeConsecutiveUserMessages(result);
  }

  // 6. 图片附件消毒
  if (opts.sanitizeImages && opts.imageLimits && (opts.imageLimits.maxDimensionPx || opts.imageLimits.maxBytes)) {
    result = sanitizeMessageImages(result, opts.imageLimits) as ApiMessage[];
  }

  // 7. reasoning 内容处理
  if (opts.dropReasoning) {
    result = processReasoningContent(result, true);
  }

  // 8. 按轮次截断
  if (opts.maxTurns && opts.maxTurns > 0) {
    result = limitHistoryTurns(result, opts.maxTurns);
  }

  return result;
}

export {
  mergeConsecutiveUserMessages,
  cleanupEmptyAssistantTurns,
  validateToolResultPairs,
  dedupeUserMessages,
  limitHistoryTurns,
  sanitizeToolCallInputs,
  processReasoningContent,
};
export type { ApiMessage, SanitizeOptions };
