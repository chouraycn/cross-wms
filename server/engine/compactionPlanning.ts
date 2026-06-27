/**
 * Compaction Planning — 压缩规划模块
 *
 * 功能特性：
 * - Token 预估 + 安全边际计算
 * - 单块/多块分块策略自动选择
 * - 工具调用对完整性校验（tool-use / tool-result 配对）
 * - 安全剥离：敏感字段和运行时上下文永不进入 LLM
 * - 超大消息降级处理
 * - 保留最近 N 条消息不压缩
 *
 * 安全规则（重要）：
 * - toolResult.details 永远不进入压缩 LLM
 * - runtime-context 类型消息永远被剥离
 * - 系统提示词永远不进入摘要
 */

import { logger } from '../logger.js';
import { estimateTokens, estimateMessagesTokens } from './contextWindowGuard.js';

// ==================== 常量 ====================

/** 默认保留的最近消息数（不进入压缩） */
export const DEFAULT_RECENT_MESSAGES_KEEP = 6;

/** 压缩分块占上下文窗口的目标比例 */
export const BASE_CHUNK_RATIO = 0.4;

/** 分块大小的下限比例 */
export const MIN_CHUNK_RATIO = 0.15;

/** 预估 token 的安全边际 */
export const COMPACTION_SAFETY_MARGIN = 1.2;

/** 摘要系统提示词 + 输出 overhead 预留 token */
export const SUMMARIZATION_OVERHEAD_TOKENS = 2048;

/** 单条消息最大 token 数，超过则标记为 oversized 不进入摘要 */
export const MAX_SINGLE_MESSAGE_TOKENS = 8000;

// ==================== 类型定义 ====================

export interface CompactionMessage {
  id?: string;
  role: string;
  content: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolUsePair {
  toolUse: CompactionMessage;
  toolResult: CompactionMessage | null;
}

export interface ChunkPlan {
  mode: 'single' | 'split';
  chunks: CompactionMessage[][];
  totalTokens: number;
  chunkTokens: number[];
}

export interface CompactionPlan {
  shouldCompact: boolean;
  reason?: string;
  summarizableMessages: CompactionMessage[];
  recentMessages: CompactionMessage[];
  systemMessages: CompactionMessage[];
  oversizedNotes: string[];
  chunkPlan: ChunkPlan;
  estimatedTotalTokens: number;
  targetSummaryTokens: number;
}

export interface CompactionPlanOptions {
  contextWindowTokens?: number;
  keepRecentMessages?: number;
  safetyMargin?: number;
  maxSingleMessageTokens?: number;
  summarizationOverheadTokens?: number;
  baseChunkRatio?: number;
  minChunkRatio?: number;
}

// ==================== 安全剥离 ====================

/**
 * 安全剥离：移除永远不应该进入 LLM 压缩的内容
 *
 * 规则：
 * 1. 移除 toolResult 中的 details 字段
 * 2. 移除 runtime-context 类型的消息
 * 3. 标记 oversized 消息
 */
export function sanitizeForCompaction(
  messages: CompactionMessage[],
  options: { maxSingleMessageTokens?: number } = {}
): {
  sanitized: CompactionMessage[];
  oversizedNotes: string[];
  strippedCount: number;
} {
  const maxSingle = options.maxSingleMessageTokens ?? MAX_SINGLE_MESSAGE_TOKENS;
  const oversizedNotes: string[] = [];
  let strippedCount = 0;

  const sanitized: CompactionMessage[] = [];

  for (const msg of messages) {
    if (msg.metadata?.['runtimeContext'] || msg.role === 'runtime-context') {
      strippedCount++;
      continue;
    }

    let cleanedMsg = { ...msg };

    if (msg.role === 'tool' && msg.metadata?.['details']) {
      cleanedMsg = {
        ...msg,
        content: sanitizeToolResultContent(msg.content),
        metadata: {
          ...msg.metadata,
          details: '[STRIPPED]',
        },
      };
      strippedCount++;
    }

    if (msg.role === 'assistant' && msg.metadata?.['toolCalls']) {
      const toolCalls = msg.metadata['toolCalls'] as Array<Record<string, unknown>>;
      if (toolCalls.length > 20) {
        cleanedMsg.metadata = {
          ...msg.metadata,
          toolCalls: toolCalls.slice(0, 20),
          toolCallsTruncated: toolCalls.length - 20,
        };
      }
    }

    const msgTokens = estimateTokens(cleanedMsg.content || '');
    if (msgTokens > maxSingle) {
      oversizedNotes.push(
        `消息 id=${msg.id || 'unknown'}, role=${msg.role}, 约 ${msgTokens} tokens 超过 ${maxSingle}，摘要中只保留概要`
      );
      cleanedMsg.content = truncateForSummary(cleanedMsg.content || '', maxSingle);
      cleanedMsg.metadata = {
        ...cleanedMsg.metadata,
        oversized: true,
        originalTokens: msgTokens,
      };
    }

    sanitized.push(cleanedMsg);
  }

  return { sanitized, oversizedNotes, strippedCount };
}

function sanitizeToolResultContent(content: string): string {
  if (content.length < 4000) return content;

  const lines = content.split('\n');
  if (lines.length > 100) {
    return lines.slice(0, 50).join('\n') + '\n... [内容已截断，仅保留前 50 行用于摘要]';
  }

  return content.slice(0, 4000) + '... [内容已截断]';
}

function truncateForSummary(text: string, maxTokens: number): string {
  const charsPerToken = 3;
  const maxChars = maxTokens * charsPerToken;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n... [内容过长，摘要仅保留开头]';
}

// ==================== 工具调用对校验 ====================

/**
 * 检查并修复 tool_use / tool_result 配对
 * 确保压缩时不会出现只有调用没有结果的情况
 */
export function repairToolCallPairs(
  messages: CompactionMessage[]
): {
  repaired: CompactionMessage[];
  unpairedToolUses: number;
  unpairedToolResults: number;
} {
  const repaired: CompactionMessage[] = [];
  let unpairedToolUses = 0;
  let unpairedToolResults = 0;

  const pendingToolUses = new Map<string, CompactionMessage>();

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCallId && msg.toolName) {
      pendingToolUses.set(msg.toolCallId, msg);
      repaired.push(msg);
      continue;
    }

    if (msg.role === 'tool' && msg.toolCallId) {
      if (pendingToolUses.has(msg.toolCallId)) {
        pendingToolUses.delete(msg.toolCallId);
      } else {
        unpairedToolResults++;
      }
      repaired.push(msg);
      continue;
    }

    repaired.push(msg);
  }

  unpairedToolUses = pendingToolUses.size;

  if (unpairedToolUses > 0 || unpairedToolResults > 0) {
    logger.warn(
      `[Compaction] 工具调用对不完整: 未配对 tool_use=${unpairedToolUses}, ` +
      `未配对 tool_result=${unpairedToolResults}`
    );
  }

  return { repaired, unpairedToolUses, unpairedToolResults };
}

// ==================== 分块规划 ====================

/**
 * 规划压缩分块策略
 * - 如果消息可以单次装入上下文，使用 single 模式
 * - 如果消息太多，使用 split 模式分多块分别摘要
 */
export function planChunks(
  messages: CompactionMessage[],
  contextWindowTokens: number,
  options: {
    safetyMargin?: number;
    overheadTokens?: number;
    baseChunkRatio?: number;
    minChunkRatio?: number;
  } = {}
): ChunkPlan {
  const safetyMargin = options.safetyMargin ?? COMPACTION_SAFETY_MARGIN;
  const overheadTokens = options.overheadTokens ?? SUMMARIZATION_OVERHEAD_TOKENS;
  const baseChunkRatio = options.baseChunkRatio ?? BASE_CHUNK_RATIO;
  const minChunkRatio = options.minChunkRatio ?? MIN_CHUNK_RATIO;

  const totalTokens = estimateMessagesTokens(messages);
  const availableTokens = Math.floor(
    (contextWindowTokens - overheadTokens) / safetyMargin
  );
  const targetChunkTokens = Math.floor(
    Math.max(
      contextWindowTokens * minChunkRatio,
      Math.min(contextWindowTokens * baseChunkRatio, availableTokens)
    )
  );

  if (totalTokens <= targetChunkTokens) {
    return {
      mode: 'single',
      chunks: [messages],
      totalTokens,
      chunkTokens: [totalTokens],
    };
  }

  const chunks: CompactionMessage[][] = [];
  const chunkTokens: number[] = [];
  let currentChunk: CompactionMessage[] = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const msgTokens = estimateTokens(msg.content || '') + 4;

    if (currentTokens + msgTokens > targetChunkTokens && currentChunk.length > 0) {
      chunks.push(currentChunk);
      chunkTokens.push(currentTokens);
      currentChunk = [msg];
      currentTokens = msgTokens;
    } else {
      currentChunk.push(msg);
      currentTokens += msgTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
    chunkTokens.push(currentTokens);
  }

  return {
    mode: chunks.length <= 1 ? 'single' : 'split',
    chunks,
    totalTokens,
    chunkTokens,
  };
}

// ==================== 完整压缩规划 ====================

/**
 * 生成完整的压缩规划
 *
 * 流程：
 * 1. 分离系统消息、最近消息、可压缩消息
 * 2. 安全剥离敏感内容
 * 3. 修复工具调用对
 * 4. 分块规划
 * 5. 计算目标输出 token 数
 */
export function buildCompactionPlan(
  messages: CompactionMessage[],
  options: CompactionPlanOptions = {}
): CompactionPlan {
  const keepRecent = options.keepRecentMessages ?? DEFAULT_RECENT_MESSAGES_KEEP;
  const safetyMargin = options.safetyMargin ?? COMPACTION_SAFETY_MARGIN;
  const maxSingleMessageTokens = options.maxSingleMessageTokens ?? MAX_SINGLE_MESSAGE_TOKENS;
  const overheadTokens = options.summarizationOverheadTokens ?? SUMMARIZATION_OVERHEAD_TOKENS;
  const contextWindow = options.contextWindowTokens ?? 128000;

  const systemMessages: CompactionMessage[] = [];
  const otherMessages: CompactionMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      otherMessages.push(msg);
    }
  }

  const splitIndex = Math.max(0, otherMessages.length - keepRecent);
  const toSummarize = otherMessages.slice(0, splitIndex);
  const recentMessages = otherMessages.slice(splitIndex);

  if (toSummarize.length < 4) {
    return {
      shouldCompact: false,
      reason: `可压缩消息不足 (${toSummarize.length} < 4)`,
      summarizableMessages: [],
      recentMessages: [...systemMessages, ...otherMessages],
      systemMessages,
      oversizedNotes: [],
      chunkPlan: { mode: 'single', chunks: [], totalTokens: 0, chunkTokens: [] },
      estimatedTotalTokens: 0,
      targetSummaryTokens: 0,
    };
  }

  const { sanitized, oversizedNotes, strippedCount } = sanitizeForCompaction(toSummarize, {
    maxSingleMessageTokens,
  });

  const { repaired } = repairToolCallPairs(sanitized);

  const totalTokens = estimateMessagesTokens(repaired) + estimateMessagesTokens(recentMessages);
  const totalWithSystem = totalTokens + estimateMessagesTokens(systemMessages);
  const usageRatio = totalWithSystem / contextWindow;

  if (usageRatio < 0.5) {
    return {
      shouldCompact: false,
      reason: `上下文使用率 ${(usageRatio * 100).toFixed(1)}% 低于 50%，暂不需要压缩`,
      summarizableMessages: repaired,
      recentMessages,
      systemMessages,
      oversizedNotes,
      chunkPlan: { mode: 'single', chunks: [repaired], totalTokens, chunkTokens: [totalTokens] },
      estimatedTotalTokens: totalWithSystem,
      targetSummaryTokens: Math.floor(contextWindow * 0.3),
    };
  }

  const chunkPlan = planChunks(repaired, contextWindow, {
    safetyMargin,
    overheadTokens,
    baseChunkRatio: options.baseChunkRatio,
    minChunkRatio: options.minChunkRatio,
  });

  const targetSummaryTokens = Math.floor(contextWindow * 0.3);

  logger.debug(
    `[Compaction] 规划完成: 总消息 ${messages.length} 条, ` +
    `可压缩 ${repaired.length} 条, 保留 ${recentMessages.length} 条, ` +
    `分块模式 ${chunkPlan.mode}, 共 ${chunkPlan.chunks.length} 块, ` +
    `预估 ${totalWithSystem} tokens (${(usageRatio * 100).toFixed(1)}%), ` +
    `剥离敏感内容 ${strippedCount} 处`
  );

  return {
    shouldCompact: true,
    summarizableMessages: repaired,
    recentMessages,
    systemMessages,
    oversizedNotes,
    chunkPlan,
    estimatedTotalTokens: totalWithSystem,
    targetSummaryTokens,
  };
}
