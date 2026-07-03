/**
 * Compaction Planning - 分块摘要与压缩规划
 *
 * 实现 OpenClaw 风格的分块摘要算法和压缩规划逻辑
 */
import type { AgentMessage } from './context-engine/types.js';

/** 默认分块比例：40% 上下文窗口用于压缩 */
export const BASE_CHUNK_RATIO = 0.4;

/** 最小分块比例：15% */
export const MIN_CHUNK_RATIO = 0.15;

/** 安全系数：1.2x，用于估算误差 */
export const SAFETY_MARGIN = 1.2;

/** 摘要开销 token 数 */
export const SUMMARIZATION_OVERHEAD_TOKENS = 4096;

/** 默认分块数 */
const DEFAULT_PARTS = 2;

/** 最小 prompt 预算 token 数 */
export const MIN_PROMPT_BUDGET_TOKENS = 8000;

/** 最小 prompt 预算比例 */
export const MIN_PROMPT_BUDGET_RATIO = 0.5;

/** 过大消息阈值：上下文窗口的 50% */
const OVERSIZED_THRESHOLD_RATIO = 0.5;

/**
 * 估算单条消息的 token 数（简化版）
 */
export function estimateMessageTokens(message: AgentMessage): number {
  // 简化估算：每个字符约等于 0.25 token
  let chars = 0;

  if (typeof message.content === 'string') {
    chars += message.content.length;
  }

  const toolCalls =
    (message as unknown as Record<string, unknown>).toolCalls ||
    (message as unknown as Record<string, unknown>).tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    chars += JSON.stringify(toolCalls).length;
  }

  // role 和其他字段的 overhead
  chars += 10;

  return Math.ceil(chars / 4);
}

/**
 * 估算多条消息的 token 数
 */
export function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * 规范化分块数
 */
export function normalizeCompactionParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) {
    return 1;
  }
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

/**
 * 提取消息中的工具调用 ID
 */
function extractToolCallIds(message: AgentMessage): Set<string> {
  const ids = new Set<string>();

  if (message.role === 'assistant' && message.toolCalls) {
    for (const tc of message.toolCalls) {
      if (tc && typeof tc === 'object' && 'id' in tc) {
        ids.add(String(tc.id));
      }
    }
  }

  return ids;
}

/**
 * 提取工具结果中的 tool_call_id
 */
function extractToolResultId(message: AgentMessage): string | null {
  if (message.role === 'tool' && message.toolCallId) {
    return String(message.toolCallId);
  }
  return null;
}

/**
 * 检测是否为有效的工具调用消息
 */
function isActiveToolCall(message: AgentMessage): boolean {
  if (message.role !== 'assistant') return false;

  const toolCalls = message.toolCalls;
  if (!toolCalls || toolCalls.length === 0) return false;

  // 检查 stopReason，排除 aborted 和 error
  const stopReason = (message as unknown as Record<string, unknown>).stopReason as string | undefined;
  return stopReason !== 'aborted' && stopReason !== 'error';
}

/**
 * 按 token 比例分割消息（保持工具对不分离）
 *
 * @param messages 消息数组
 * @param parts 分块数
 */
export function splitMessagesByTokenShare(
  messages: AgentMessage[],
  parts: number = DEFAULT_PARTS,
): AgentMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  const normalizedParts = normalizeCompactionParts(parts, messages.length);
  if (normalizedParts <= 1) {
    return [messages];
  }

  const perMessageTokens = messages.map(m => estimateMessageTokens(m));
  const totalTokens = perMessageTokens.reduce((sum, t) => sum + t, 0);
  const targetTokens = totalTokens / normalizedParts;

  const chunks: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let currentTokens = 0;
  let pendingToolCallIds = new Set<string>();
  let pendingChunkStartIndex: number | null = null;
  let currentTokenCounts: number[] = [];

  const splitCurrentAtPendingBoundary = (): boolean => {
    if (
      pendingChunkStartIndex === null ||
      pendingChunkStartIndex <= 0 ||
      chunks.length >= normalizedParts - 1
    ) {
      return false;
    }

    // 保持 assistant tool_use 和其 tool_result 在同一分块
    chunks.push(current.slice(0, pendingChunkStartIndex));
    current = current.slice(pendingChunkStartIndex);
    currentTokenCounts = currentTokenCounts.slice(pendingChunkStartIndex);
    currentTokens = currentTokenCounts.reduce((sum, t) => sum + t, 0);
    pendingChunkStartIndex = 0;
    return true;
  };

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const messageTokens = perMessageTokens[index];

    // 在工具对完成后且当前分块足够大时分割
    if (
      pendingToolCallIds.size === 0 &&
      chunks.length < normalizedParts - 1 &&
      current.length > 0 &&
      currentTokens + messageTokens > targetTokens
    ) {
      chunks.push(current);
      current = [];
      currentTokenCounts = [];
      currentTokens = 0;
      pendingChunkStartIndex = null;
    }

    current.push(message);
    currentTokenCounts.push(messageTokens);
    currentTokens += messageTokens;

    if (isActiveToolCall(message)) {
      pendingToolCallIds = extractToolCallIds(message);
      pendingChunkStartIndex = current.length - 1;
    } else if (message.role === 'tool') {
      const resultId = extractToolResultId(message);
      if (!resultId) {
        pendingToolCallIds = new Set();
        pendingChunkStartIndex = null;
      } else {
        pendingToolCallIds.delete(resultId);
      }

      if (
        pendingToolCallIds.size === 0 &&
        chunks.length < normalizedParts - 1 &&
        currentTokens > targetTokens
      ) {
        splitCurrentAtPendingBoundary();
        pendingChunkStartIndex = null;
      }
    }
  }

  // 处理剩余的未完成工具对
  if (pendingToolCallIds.size > 0 && currentTokens > targetTokens) {
    splitCurrentAtPendingBoundary();
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * 按最大 token 数分块
 */
export function chunkMessagesByMaxTokens(
  messages: AgentMessage[],
  maxTokens: number,
): AgentMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  // 应用安全系数
  const effectiveMax = Math.max(1, Math.floor(maxTokens / SAFETY_MARGIN));

  const perMessageTokens = messages.map(m => estimateMessageTokens(m));
  const chunks: AgentMessage[][] = [];
  let currentChunk: AgentMessage[] = [];
  let currentTokens = 0;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const messageTokens = perMessageTokens[index];

    if (currentChunk.length > 0 && currentTokens + messageTokens > effectiveMax) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += messageTokens;

    // 如果单条消息就超过限制，分割超大消息
    if (messageTokens > effectiveMax) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * 计算自适应分块比例
 */
export function computeAdaptiveChunkRatio(
  messages: AgentMessage[],
  contextWindow: number,
): number {
  if (messages.length === 0) {
    return BASE_CHUNK_RATIO;
  }

  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = totalTokens / messages.length;

  // 应用安全系数
  const safeAvgTokens = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvgTokens / contextWindow;

  // 如果平均消息超过上下文窗口的 10%，减小分块比例
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}

/**
 * 检测单条消息是否过大无法摘要
 */
export function isOversizedForSummary(
  message: AgentMessage,
  contextWindow: number,
): boolean {
  const tokens = estimateMessageTokens(message) * SAFETY_MARGIN;
  return tokens > contextWindow * OVERSIZED_THRESHOLD_RATIO;
}

/**
 * 构建摘要分块
 */
export function buildSummaryChunks(
  messages: AgentMessage[],
  maxChunkTokens: number,
): AgentMessage[][] {
  return chunkMessagesByMaxTokens(messages, maxChunkTokens);
}

/**
 * 过大消息降级计划
 */
export interface OversizedFallbackPlan {
  smallMessages: AgentMessage[];
  oversizedNotes: string[];
}

/**
 * 构建过大消息降级计划
 */
export function buildOversizedFallbackPlan(
  messages: AgentMessage[],
  contextWindow: number,
): OversizedFallbackPlan {
  const smallMessages: AgentMessage[] = [];
  const oversizedNotes: string[] = [];
  const oversizedThreshold = contextWindow * OVERSIZED_THRESHOLD_RATIO;

  for (const msg of messages) {
    const tokens = estimateMessageTokens(msg) * SAFETY_MARGIN;
    if (tokens > oversizedThreshold) {
      const role = msg.role || 'message';
      const tokenK = (tokens / 1000).toFixed(1);
      oversizedNotes.push(`[Large ${role} (~${tokenK}K tokens) omitted from summary]`);
    } else {
      smallMessages.push(msg);
    }
  }

  return { smallMessages, oversizedNotes };
}

/**
 * 阶段分割计划
 */
export interface StageSplitPlan {
  mode: 'single' | 'split';
  chunks?: AgentMessage[][];
}

/**
 * 构建阶段分割计划
 */
export function buildStageSplitPlan(
  messages: AgentMessage[],
  maxChunkTokens: number,
  parts: number = DEFAULT_PARTS,
  minMessagesForSplit: number = 4,
): StageSplitPlan {
  const normalizedParts = normalizeCompactionParts(parts, messages.length);
  const totalTokens = estimateMessagesTokens(messages);

  if (
    normalizedParts <= 1 ||
    messages.length < minMessagesForSplit ||
    totalTokens <= maxChunkTokens
  ) {
    return { mode: 'single' };
  }

  const chunks = splitMessagesByTokenShare(messages, parts).filter(
    chunk => chunk.length > 0,
  );

  return chunks.length > 1 ? { mode: 'split', chunks } : { mode: 'single' };
}

/**
 * 历史剪枝结果
 */
export interface HistoryPruneResult {
  messages: AgentMessage[];
  droppedMessages: AgentMessage[];
  droppedChunks: number;
  droppedMessagesCount: number;
  droppedTokens: number;
  keptTokens: number;
  budgetTokens: number;
}

/**
 * 丢弃最旧的分块直到历史适合上下文
 */
export function pruneHistoryForContextShare(
  messages: AgentMessage[],
  maxContextTokens: number,
  maxHistoryShare: number = 0.5,
  parts: number = DEFAULT_PARTS,
): HistoryPruneResult {
  const budgetTokens = Math.max(1, Math.floor(maxContextTokens * maxHistoryShare));
  let keptMessages = messages;
  const allDroppedMessages: AgentMessage[] = [];
  let droppedChunks = 0;
  let droppedMessagesCount = 0;
  let droppedTokens = 0;

  const normalizedParts = normalizeCompactionParts(parts, keptMessages.length);

  while (keptMessages.length > 0 && estimateMessagesTokens(keptMessages) > budgetTokens) {
    const chunks = splitMessagesByTokenShare(keptMessages, normalizedParts);
    if (chunks.length <= 1) {
      break;
    }

    const [dropped, ...rest] = chunks;
    const flatRest = rest.flat();

    droppedChunks += 1;
    droppedMessagesCount += dropped.length;
    droppedTokens += estimateMessagesTokens(dropped);
    allDroppedMessages.push(...dropped);
    keptMessages = flatRest;
  }

  return {
    messages: keptMessages,
    droppedMessages: allDroppedMessages,
    droppedChunks,
    droppedMessagesCount,
    droppedTokens,
    keptTokens: estimateMessagesTokens(keptMessages),
    budgetTokens,
  };
}

/**
 * 历史剪枝计划
 */
export interface HistoryPrunePlan {
  summarizableTokens: number;
  newContentTokens: number;
  maxHistoryTokens: number;
  pruned?: HistoryPruneResult;
}

/**
 * 计算历史剪枝计划
 */
export function buildHistoryPrunePlan(
  messagesToSummarize: AgentMessage[],
  turnPrefixMessages: AgentMessage[],
  tokensBefore: number,
  contextWindowTokens: number,
  maxHistoryShare: number,
  parts?: number,
): HistoryPrunePlan {
  const summarizableTokens =
    estimateMessagesTokens(messagesToSummarize) + estimateMessagesTokens(turnPrefixMessages);
  const newContentTokens = Math.max(0, Math.floor(tokensBefore - summarizableTokens));
  const maxHistoryTokens = Math.floor(contextWindowTokens * maxHistoryShare);

  if (newContentTokens <= maxHistoryTokens) {
    return {
      summarizableTokens,
      newContentTokens,
      maxHistoryTokens,
    };
  }

  return {
    summarizableTokens,
    newContentTokens,
    maxHistoryTokens,
    pruned: pruneHistoryForContextShare(messagesToSummarize, contextWindowTokens, maxHistoryShare, parts),
  };
}

/**
 * 计算压缩后的 token 估算
 */
export function estimateTokensAfterCompaction(
  originalTokens: number,
  compressedChunks: number,
  summaryOverhead: number = SUMMARIZATION_OVERHEAD_TOKENS,
): number {
  return originalTokens + summaryOverhead;
}
