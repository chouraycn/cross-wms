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
 * 精细化 token 估算（与 contextTruncate.ts 保持一致）
 *
 * CJK 字符 ≈ 1.5 token
 * JSON/代码标点 ≈ 0.8 token
 * 普通 ASCII ≈ 0.35 token
 * 全局 1.5x 安全系数
 */
export function estimateMessageTokens(message: AgentMessage): number {
  let tokens = 0;

  // role + formatting overhead per message
  tokens += 4;

  // content token
  if (typeof message.content === 'string') {
    tokens += estimateTextTokens(message.content);
  }

  // reasoning_content token（防御性访问，AgentMessage 可能不含此字段）
  const reasoningContent = (message as unknown as Record<string, unknown>).reasoning_content;
  if (typeof reasoningContent === 'string' && reasoningContent.length > 0) {
    tokens += estimateTextTokens(reasoningContent);
  }

  // tool_calls token（支持 camelCase 和 snake_case）
  const toolCalls =
    (message as unknown as Record<string, unknown>).toolCalls ||
    (message as unknown as Record<string, unknown>).tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    const tcJson = JSON.stringify(toolCalls);
    // tool_calls JSON 序列化后含大量标点，BPE 分词比纯文本更碎
    tokens += Math.ceil(estimateTextTokens(tcJson) * 1.5);
  }

  return Math.ceil(tokens);
}

/**
 * 精细化文本 token 估算
 * CJK 字符: 1.5 token, JSON 标点: 0.8 token, 普通 ASCII: 0.35 token
 * 全局 1.5x 安全系数
 */
function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一汉字
      (code >= 0x3040 && code <= 0x30ff) || // 日文假名
      (code >= 0xac00 && code <= 0xd7af)    // 韩文音节
    ) {
      tokens += 1.5;
    } else if ('{}[]":,/\\<>=|`'.includes(ch)) {
      tokens += 0.8;
    } else {
      tokens += 0.35;
    }
  }
  return Math.ceil(tokens * 1.5); // 安全系数
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
 *
 * 压缩后的 token 估算：
 * - 保留的消息按原 token 计
 * - 压缩的消息按摘要 token 估算（通常为原文的 10-20%）
 * - 加上摘要开销
 */
export function estimateTokensAfterCompaction(
  originalTokens: number,
  plan: HistoryPrunePlan,
): number {
  // 摘要通常为原文的 15% 加上固定开销
  const SUMMARIZE_RATIO = 0.15;

  if (plan.pruned) {
    // 有剪枝：保留的消息按原 token 计，被剪枝的消息按摘要估算
    const retainedTokens = plan.pruned.keptTokens;
    const compressedOriginalTokens = plan.pruned.droppedTokens;
    const summaryTokens =
      Math.ceil(compressedOriginalTokens * SUMMARIZE_RATIO) + SUMMARIZATION_OVERHEAD_TOKENS;
    return retainedTokens + summaryTokens + plan.newContentTokens;
  }

  // 无剪枝：所有可摘要消息被压缩为摘要，新内容保留
  const summarizableTokens = plan.summarizableTokens > 0 ? plan.summarizableTokens : originalTokens;
  const summaryTokens =
    Math.ceil(summarizableTokens * SUMMARIZE_RATIO) + SUMMARIZATION_OVERHEAD_TOKENS;
  return summaryTokens + plan.newContentTokens;
}

/**
 * 压缩质量评估结果
 */
export interface CompactionQualityMetrics {
  /** 压缩比（压缩后/压缩前） */
  compressionRatio: number;
  /** 保留的关键信息比例 */
  keyInfoRetention: number;
  /** 是否保留了工具调用对 */
  toolPairsPreserved: boolean;
  /** 是否保留了系统消息 */
  systemMessagePreserved: boolean;
  /** 压缩后的预估 token 数 */
  estimatedTokensAfter: number;
  /** 评分（0-100，越高越好） */
  score: number;
}

/**
 * 评估压缩质量
 *
 * 根据压缩前后的消息数组计算压缩比、关键信息保留率、工具对保留情况等指标，
 * 并给出综合评分（0-100）。
 *
 * @param originalMessages 原始消息数组
 * @param compressedMessages 压缩后消息数组
 * @param originalTokens 原始消息的 token 数
 */
export function evaluateCompactionQuality(
  originalMessages: Array<{ role: string; content: string; toolCalls?: unknown[]; tool_calls?: unknown[] }>,
  compressedMessages: Array<{ role: string; content: string; toolCalls?: unknown[]; tool_calls?: unknown[] }>,
  originalTokens: number,
): CompactionQualityMetrics {
  const compressedTokens = compressedMessages.reduce(
    (sum, m) => sum + estimateMessageTokens(m as AgentMessage),
    0,
  );

  const compressionRatio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

  // 检查工具调用对是否保留（至少保留 50% 的 tool_calls）
  const originalToolCalls = originalMessages.filter(
    m => (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) ||
         (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0),
  ).length;
  const compressedToolCalls = compressedMessages.filter(
    m => (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) ||
         (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0),
  ).length;
  const toolPairsPreserved = originalToolCalls === 0 || compressedToolCalls >= originalToolCalls * 0.5;

  // 检查系统消息是否保留
  const systemMessagePreserved = compressedMessages.some(m => m.role === 'system');

  // 关键信息保留率（简单估算：基于消息数量比）
  const keyInfoRetention = originalMessages.length > 0
    ? Math.min(1, compressedMessages.length / originalMessages.length)
    : 1;

  // 综合评分
  let score = 0;
  // 压缩比越低越好（但不低于 0.1，否则可能信息丢失过多）
  if (compressionRatio <= 0.3) score += 30;
  else if (compressionRatio <= 0.5) score += 25;
  else if (compressionRatio <= 0.7) score += 15;
  else score += 5;

  // 工具对保留
  if (toolPairsPreserved) score += 25;

  // 系统消息保留
  if (systemMessagePreserved) score += 15;

  // 关键信息保留
  score += Math.round(keyInfoRetention * 30);

  return {
    compressionRatio,
    keyInfoRetention,
    toolPairsPreserved,
    systemMessagePreserved,
    estimatedTokensAfter: compressedTokens,
    score,
  };
}
