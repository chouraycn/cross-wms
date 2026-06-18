/**
 * Context Compression — 上下文智能压缩
 *
 * 当 API 消息总 token 数超过模型上下文窗口时，
 * 先尝试用 LLM 将旧消息压缩为摘要，再截断（而非直接丢弃）。
 *
 * v1.5.116: 新增 compressContextWithSummary — 上下文溢出时自动压缩
 */

import { estimateTokens, estimateMessagesTokens, sanitizeToolMessages } from './contextTruncate.js';
import { callAIModel } from '../aiClient.js';
import type { ModelCallConfig } from '../aiClient.js';

/**
 * 压缩回调类型
 * 接收待丢弃的消息，返回压缩后的摘要文本
 */
export type CompressCallback = (
  droppedMessages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
) => Promise<string>;

/**
 * 默认压缩回调 — 用 LLM 将旧消息压缩为结构化摘要
 */
export async function defaultCompressCallback(
  droppedMessages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
): Promise<string> {
  const conversationText = droppedMessages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 500)}`)
    .join('\n');

  const summaryPrompt = `请将以下对话历史压缩为一段简洁的结构化摘要，保留：
1. 用户的核心需求和意图
2. 已执行的关键操作和结果
3. 重要的数据或参数
4. 未完成的任务

对话历史：
${conversationText}

请直接输出摘要，不要加任何解释或前缀。`;

  try {
    const summary = await callAIModel(
      modelConfig,
      [{ role: 'user', content: summaryPrompt }],
      undefined,
    );
    return `[历史对话摘要，供参考]：\n${summary.trim()}`;
  } catch (err) {
    console.warn('[ContextCompress] LLM 摘要失败，降级为简单截断：', err);
    return '[历史对话已截断，内容过长已省略]';
  }
}

/**
 * 智能压缩上下文 — 先压缩再截断
 *
 * 策略：
 * 1. 估算 token，若不溢出则直接返回
 * 2. 若溢出，识别会被丢弃的消息
 * 3. 用 compressCallback 将丢弃的消息压缩为摘要
 * 4. 将摘要作为 system 消息注入到保留消息的开头
 * 5. 若压缩失败，降级为简单截断
 *
 * @param apiMessages 原始消息列表
 * @param contextWindow 模型上下文窗口
 * @param maxOutputTokens 最大输出 token
 * @param toolsCount 工具定义数量
 * @param modelConfig 用于压缩摘要的模型配置
 * @param compressCallback 压缩回调（默认使用 LLM 摘要）
 * @returns 压缩后的消息数组 + 是否发生了压缩
 */
export async function compressContextWithSummary(
  apiMessages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
  contextWindow: number,
  maxOutputTokens: number,
  toolsCount: number,
  modelConfig: ModelCallConfig,
  compressCallback?: CompressCallback,
  workingMemoryMessages?: Array<{ role: string; content: string }>,
): Promise<{ messages: typeof apiMessages; compressed: boolean; truncated: boolean }> {
  // v5.0: 如果有 workingMemoryMessages，在压缩前注入
  if (workingMemoryMessages && workingMemoryMessages.length > 0) {
    apiMessages = [...workingMemoryMessages as typeof apiMessages, ...apiMessages];
  }
  const toolsTokenEstimate = toolsCount * 150;
  const safetyMargin = 2000;
  const maxInputTokens = contextWindow - maxOutputTokens - toolsTokenEstimate - safetyMargin;

  if (maxInputTokens <= 0) {
    return { messages: apiMessages, compressed: false, truncated: false };
  }

  const currentTokens = estimateMessagesTokens(apiMessages);
  if (currentTokens <= maxInputTokens) {
    return { messages: apiMessages, compressed: false, truncated: false };
  }

  // 识别会被丢弃的消息（从前往后，直到 token 用完）
  let runningTokens = 0;
  let compressStartIdx = -1;
  for (let i = 0; i < apiMessages.length; i++) {
    const msgTokens = estimateMessagesTokens([apiMessages[i]]);
    if (runningTokens + msgTokens > maxInputTokens) {
      compressStartIdx = i;
      break;
    }
    runningTokens += msgTokens;
  }

  if (compressStartIdx <= 0) {
    // 不需要压缩（其实不会到这里，因为 currentTokens > maxInputTokens）
    return { messages: apiMessages, compressed: false, truncated: false };
  }

  // v1.5.120: 修正分割点 — 如果 compressStartIdx 落在 tool 消息上，
  // 向前扫描跳过所有连续的 tool 消息（它们的 parent assistant(tool_calls) 在压缩区）
  while (compressStartIdx < apiMessages.length &&
         apiMessages[compressStartIdx].role === 'tool' &&
         apiMessages[compressStartIdx].tool_call_id) {
    compressStartIdx++;
  }

  // 如果调整后所有消息都要被压缩，降级为简单截断
  if (compressStartIdx >= apiMessages.length) {
    const { truncateContextForModel } = await import('./contextTruncate.js');
    const result = truncateContextForModel(apiMessages, contextWindow, maxOutputTokens, toolsCount);
    return { ...result, compressed: false };
  }

  // 提取待压缩的消息（前 compressStartIdx 条）
  const toCompress = apiMessages.slice(0, compressStartIdx)
    .filter(m => typeof m.content === 'string')
    .map(m => ({ role: m.role, content: String(m.content) }));

  if (toCompress.length === 0) {
    // 没有可压缩的内容，降级为简单截断
    const { truncateContextForModel } = await import('./contextTruncate.js');
    const result = truncateContextForModel(apiMessages, contextWindow, maxOutputTokens, toolsCount);
    return { ...result, compressed: false };
  }

  console.log(`[ContextCompress] 开始压缩 ${toCompress.length} 条消息...`);

  try {
    const callback = compressCallback || defaultCompressCallback;
    const summary = await callback(toCompress, modelConfig);

    // 将摘要注入到保留消息的开头
    const retained = apiMessages.slice(compressStartIdx);
    const compressedMessages = [
      { role: 'system', content: summary },
      ...retained,
    ] as typeof apiMessages;

    // v1.5.120: 安全网 — 清理可能的孤儿 tool_calls/tool 消息
    const sanitizedMessages = sanitizeToolMessages(compressedMessages as Parameters<typeof sanitizeToolMessages>[0]);

    // 压缩后再次检查是否超出限制
    const afterTokens = estimateMessagesTokens(sanitizedMessages);
    console.log(`[ContextCompress] ✅ 压缩完成: ~${currentTokens} → ~${afterTokens} tokens（摘要 ${estimateTokens(summary)} tokens）`);

    if (afterTokens > maxInputTokens) {
      // 压缩后仍然超出，降级为简单截断
      console.log('[ContextCompress] 压缩后仍然超出限制，降级为简单截断');
      const { truncateContextForModel } = await import('./contextTruncate.js');
      const result = truncateContextForModel(sanitizedMessages, contextWindow, maxOutputTokens, toolsCount);
      return { ...result, compressed: true };
    }

    return { messages: sanitizedMessages, compressed: true, truncated: false };
  } catch (err) {
    console.warn('[ContextCompress] 压缩失败，降级为简单截断：', err);
    const { truncateContextForModel } = await import('./contextTruncate.js');
    const result = truncateContextForModel(apiMessages, contextWindow, maxOutputTokens, toolsCount);
    return { ...result, compressed: false };
  }
}
