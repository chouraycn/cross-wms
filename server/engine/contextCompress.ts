/**
 * Context Compression — 上下文智能压缩
 *
 * 当 API 消息总 token 数超过模型上下文窗口时，
 * 先尝试用 LLM 将旧消息压缩为摘要，再截断（而非直接丢弃）。
 *
 * v1.5.116: 新增 compressContextWithSummary — 上下文溢出时自动压缩
 * v2.0: 新增阶段式摘要、标识符保留、过大消息降级等功能
 */

import { estimateTokens, estimateMessagesTokens, sanitizeToolMessages } from './contextTruncate.js';
import { callAIModel } from '../aiClient.js';
import type { ModelCallConfig } from '../aiClient.js';
import { logger } from '../logger.js';
import {
  buildSummaryChunks,
  buildOversizedFallbackPlan,
  buildStageSplitPlan,
  chunkMessagesByMaxTokens,
  splitMessagesByTokenShare,
  estimateMessageTokens,
  computeAdaptiveChunkRatio,
  isOversizedForSummary,
  type AgentMessage,
} from './compaction-planning.js';
import {
  IDENTIFIER_PRESERVATION_INSTRUCTIONS,
  resolveIdentifierPreservationInstructions as resolveWmsIdentifierInstructions,
  type CompactionIdentifierConfig,
} from './compaction-identifier.js';

/**
 * 压缩回调类型
 * 接收待丢弃的消息，返回压缩后的摘要文本
 */
export type CompressCallback = (
  droppedMessages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
) => Promise<string>;

/**
 * 压缩摘要指令配置
 */
export type CompactionSummarizationInstructions = {
  identifierPolicy?: CompactionIdentifierConfig['policy'];
  identifierInstructions?: string;
};

const DEFAULT_SUMMARY_FALLBACK = 'No prior history.';

const MERGE_SUMMARIES_INSTRUCTIONS = [
  'Merge these partial summaries into a single cohesive summary.',
  '',
  'MUST PRESERVE:',
  '- Active tasks and their current status (in-progress, blocked, pending)',
  '- Batch operation progress (e.g., \'5/17 items completed\')',
  '- The last thing the user requested and what was being done about it',
  '- Decisions made and their rationale',
  '- TODOs, open questions, and constraints',
  '- Any commitments or follow-ups promised',
  '',
  'PRIORITIZE recent context over older history. The agent needs to know',
  'what it was doing, not just what was discussed.',
].join('\n');

function resolveIdentifierPreservationInstructions(
  instructions?: CompactionSummarizationInstructions,
): string | undefined {
  return resolveWmsIdentifierInstructions({
    policy: instructions?.identifierPolicy ?? 'wms',
    customInstructions: instructions?.identifierInstructions,
  });
}

export function buildCompactionSummarizationInstructions(
  customInstructions?: string,
  instructions?: CompactionSummarizationInstructions,
): string | undefined {
  const custom = customInstructions?.trim();
  const identifierPreservation = resolveIdentifierPreservationInstructions(instructions);
  if (!identifierPreservation && !custom) {
    return undefined;
  }
  if (!custom) {
    return identifierPreservation;
  }
  if (!identifierPreservation) {
    return `Additional focus:\n${custom}`;
  }
  return `${identifierPreservation}\n\nAdditional focus:\n${custom}`;
}

async function generateSummaryWithInstructions(
  messages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
  customInstructions?: string,
  summarizationInstructions?: CompactionSummarizationInstructions,
  previousSummary?: string,
): Promise<string> {
  const conversationText = messages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  const identifierInstructions = buildCompactionSummarizationInstructions(
    customInstructions,
    summarizationInstructions,
  );

  let summaryPrompt = '请将以下对话历史压缩为一段简洁的结构化摘要。';

  if (identifierInstructions) {
    summaryPrompt += `\n\n${identifierInstructions}`;
  }

  summaryPrompt += `\n\n必须保留：
1. 用户的核心需求和意图
2. 已执行的关键操作和结果
3. 重要的数据或参数
4. 未完成的任务

对话历史：
${conversationText}

请直接输出摘要，不要加任何解释或前缀。`;

  if (previousSummary) {
    summaryPrompt = `已有摘要：\n${previousSummary}\n\n${summaryPrompt}`;
  }

  try {
    const summary = await callAIModel(
      modelConfig,
      [{ role: 'user', content: summaryPrompt }],
      undefined,
    );
    return summary.trim();
  } catch (err) {
    logger.warn('[ContextCompress] LLM 摘要失败：', err);
    throw err;
  }
}

async function summarizeChunks(
  messages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
  maxChunkTokens: number,
  customInstructions?: string,
  summarizationInstructions?: CompactionSummarizationInstructions,
  previousSummary?: string,
): Promise<string> {
  if (messages.length === 0) {
    return previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const agentMessages: AgentMessage[] = messages.map(m => ({
    role: m.role as AgentMessage['role'],
    content: m.content,
    timestamp: Date.now(),
  }));

  const chunks = chunkMessagesByMaxTokens(agentMessages, maxChunkTokens);
  let summary = previousSummary;
  const effectiveInstructions = buildCompactionSummarizationInstructions(
    customInstructions,
    summarizationInstructions,
  );

  for (const chunk of chunks) {
    const chunkMessages = chunk.map(m => ({ role: m.role, content: String(m.content) }));
    try {
      summary = await generateSummaryWithInstructions(
        chunkMessages,
        modelConfig,
        effectiveInstructions,
        summarizationInstructions,
        summary,
      );
    } catch (err) {
      logger.warn('[ContextCompress] 分块摘要失败：', err);
      if (!summary) {
        throw err;
      }
      break;
    }
  }

  return summary ?? DEFAULT_SUMMARY_FALLBACK;
}

async function summarizeWithFallback(
  messages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
  maxChunkTokens: number,
  contextWindow: number,
  customInstructions?: string,
  summarizationInstructions?: CompactionSummarizationInstructions,
  previousSummary?: string,
): Promise<string> {
  if (messages.length === 0) {
    return previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const agentMessages: AgentMessage[] = messages.map(m => ({
    role: m.role as AgentMessage['role'],
    content: m.content,
    timestamp: Date.now(),
  }));

  try {
    return await summarizeChunks(
      messages,
      modelConfig,
      maxChunkTokens,
      customInstructions,
      summarizationInstructions,
      previousSummary,
    );
  } catch (fullError) {
    logger.warn(`[ContextCompress] 完整摘要失败：${fullError}`);
  }

  const { smallMessages, oversizedNotes } = buildOversizedFallbackPlan(agentMessages, contextWindow);

  if (smallMessages.length > 0 && smallMessages.length !== agentMessages.length) {
    try {
      const smallMessagesForSummary = smallMessages.map(m => ({
        role: m.role,
        content: String(m.content),
      }));
      const partialSummary = await summarizeChunks(
        smallMessagesForSummary,
        modelConfig,
        maxChunkTokens,
        customInstructions,
        summarizationInstructions,
        previousSummary,
      );
      const notes = oversizedNotes.length > 0 ? `\n\n${oversizedNotes.join('\n')}` : '';
      return partialSummary + notes;
    } catch (partialError) {
      logger.warn(`[ContextCompress] 部分摘要也失败：${partialError}`);
    }
  }

  if (previousSummary) {
    return previousSummary;
  }

  return (
    `Context contained ${messages.length} messages. ` +
    `Summary unavailable due to size limits.`
  );
}

export async function summarizeInStages(
  messages: Array<{ role: string; content: string }>,
  modelConfig: ModelCallConfig,
  maxChunkTokens: number,
  contextWindow: number,
  customInstructions?: string,
  summarizationInstructions?: CompactionSummarizationInstructions,
  previousSummary?: string,
  parts: number = 2,
  minMessagesForSplit: number = 4,
): Promise<string> {
  if (messages.length === 0) {
    return previousSummary ?? DEFAULT_SUMMARY_FALLBACK;
  }

  const agentMessages: AgentMessage[] = messages.map(m => ({
    role: m.role as AgentMessage['role'],
    content: m.content,
    timestamp: Date.now(),
  }));

  const plan = buildStageSplitPlan(agentMessages, maxChunkTokens, parts, minMessagesForSplit);

  if (plan.mode === 'single') {
    return summarizeWithFallback(
      messages,
      modelConfig,
      maxChunkTokens,
      contextWindow,
      customInstructions,
      summarizationInstructions,
      previousSummary,
    );
  }

  const partialSummaries: string[] = [];
  for (const chunk of plan.chunks || []) {
    const chunkMessages = chunk.map(m => ({ role: m.role, content: String(m.content) }));
    partialSummaries.push(
      await summarizeWithFallback(
        chunkMessages,
        modelConfig,
        maxChunkTokens,
        contextWindow,
        customInstructions,
        summarizationInstructions,
        undefined,
      ),
    );
  }

  if (partialSummaries.length === 1) {
    return partialSummaries[0];
  }

  const summaryMessages: Array<{ role: string; content: string }> = partialSummaries.map(
    summary => ({ role: 'user', content: summary }),
  );

  const custom = customInstructions?.trim();
  const mergeInstructions = custom
    ? `${MERGE_SUMMARIES_INSTRUCTIONS}\n\n${custom}`
    : MERGE_SUMMARIES_INSTRUCTIONS;

  return summarizeWithFallback(
    summaryMessages,
    modelConfig,
    maxChunkTokens,
    contextWindow,
    mergeInstructions,
    summarizationInstructions,
  );
}

/**
 * 智能压缩上下文 — 先压缩再截断
 *
 * 策略：
 * 1. 估算 token，若不溢出则直接返回
 * 2. 若溢出，识别会被丢弃的消息
 * 3. 用阶段式摘要将丢弃的消息压缩为摘要（支持标识符保留）
 * 4. 将摘要作为 system 消息注入到保留消息的开头
 * 5. 若压缩失败，降级为简单截断
 *
 * @param apiMessages 原始消息列表
 * @param contextWindow 模型上下文窗口
 * @param maxOutputTokens 最大输出 token
 * @param toolsCount 工具定义数量
 * @param modelConfig 用于压缩摘要的模型配置
 * @param compressCallback 压缩回调（默认使用 LLM 摘要）
 * @param workingMemoryMessages 工作记忆消息
 * @param summarizationInstructions 摘要指令配置（标识符保留等）
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
  summarizationInstructions?: CompactionSummarizationInstructions,
): Promise<{ messages: typeof apiMessages; compressed: boolean; truncated: boolean }> {
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
  const forceTruncate = apiMessages.length > 80;
  if (currentTokens <= maxInputTokens && !forceTruncate) {
    return { messages: apiMessages, compressed: false, truncated: false };
  }
  if (forceTruncate && currentTokens <= maxInputTokens) {
    logger.debug(`[ContextCompress] 消息数 ${apiMessages.length} > 80，强制截断（估算 ${currentTokens} 未超限）`);
  }

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
    return { messages: apiMessages, compressed: false, truncated: false };
  }

  while (compressStartIdx < apiMessages.length &&
         apiMessages[compressStartIdx].role === 'tool' &&
         apiMessages[compressStartIdx].tool_call_id) {
    compressStartIdx++;
  }

  if (compressStartIdx >= apiMessages.length) {
    const { truncateContextForModel } = await import('./contextTruncate.js');
    const result = truncateContextForModel(apiMessages, contextWindow, maxOutputTokens, toolsCount);
    return { ...result, compressed: false };
  }

  const toCompress = apiMessages.slice(0, compressStartIdx)
    .filter(m => typeof m.content === 'string')
    .map(m => ({ role: m.role, content: String(m.content) }));

  if (toCompress.length === 0) {
    const { truncateContextForModel } = await import('./contextTruncate.js');
    const result = truncateContextForModel(apiMessages, contextWindow, maxOutputTokens, toolsCount);
    return { ...result, compressed: false };
  }

  logger.debug(`[ContextCompress] 开始压缩 ${toCompress.length} 条消息...`);

  try {
    let summary: string;

    if (compressCallback) {
      summary = await compressCallback(toCompress, modelConfig);
    } else {
      const adaptiveRatio = computeAdaptiveChunkRatio(
        toCompress.map(m => ({ role: m.role as AgentMessage['role'], content: m.content, timestamp: Date.now() })),
        contextWindow,
      );
      const maxChunkTokens = Math.floor(contextWindow * adaptiveRatio);

      summary = await summarizeInStages(
        toCompress,
        modelConfig,
        maxChunkTokens,
        contextWindow,
        undefined,
        summarizationInstructions,
      );
    }

    const retained = apiMessages.slice(compressStartIdx);
    const compressedMessages = [
      { role: 'system', content: `[历史对话摘要，供参考]：\n${summary}` },
      ...retained,
    ] as typeof apiMessages;

    const sanitizedMessages = sanitizeToolMessages(compressedMessages as Parameters<typeof sanitizeToolMessages>[0]);

    const afterTokens = estimateMessagesTokens(sanitizedMessages);
    logger.debug(`[ContextCompress] ✅ 压缩完成: ~${currentTokens} → ~${afterTokens} tokens（摘要 ${estimateTokens(summary)} tokens）`);

    if (afterTokens > maxInputTokens) {
      logger.debug('[ContextCompress] 压缩后仍然超出限制，降级为简单截断');
      const { truncateContextForModel } = await import('./contextTruncate.js');
      const result = truncateContextForModel(sanitizedMessages, contextWindow, maxOutputTokens, toolsCount);
      return { ...result, compressed: true };
    }

    return { messages: sanitizedMessages, compressed: true, truncated: false };
  } catch (err) {
    logger.warn('[ContextCompress] 压缩失败，降级为简单截断：', err);
    const { truncateContextForModel } = await import('./contextTruncate.js');
    const result = truncateContextForModel(apiMessages, contextWindow, maxOutputTokens, toolsCount);
    return { ...result, compressed: false };
  }
}
