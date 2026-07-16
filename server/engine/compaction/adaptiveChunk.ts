/**
 * 自适应分块比例 — 参考 OpenClaw compaction-planning.ts
 *
 * 根据消息特征动态调整分块比例：
 * - 基准比例 0.4（占用 40% 的上下文窗口）
 * - 最小比例 0.15（避免过小分块）
 * - 安全边际 1.2（应对 token 估算不精确）
 * - 自适应计算：根据消息总 token 数和窗口大小动态调整
 */

// ==================== 常量定义 ====================

/** 默认上下文窗口 token 数 */
export const DEFAULT_CONTEXT_TOKENS = 128000;

/** 基准分块比例（占用上下文窗口的比例） */
export const BASE_CHUNK_RATIO = 0.4;

/** 最小分块比例 */
export const MIN_CHUNK_RATIO = 0.15;

/** 安全边际（token 估算不精确的缓冲） */
export const SAFETY_MARGIN = 1.2;

/** 摘要开销 token 数（系统提示、标签等） */
export const SUMMARIZATION_OVERHEAD_TOKENS = 4096;

/** 单条消息最大 token 数 */
export const MAX_SINGLE_MESSAGE_TOKENS = 8000;

/** 默认保留的最近消息数 */
export const DEFAULT_RECENT_MESSAGES_KEEP = 6;

/** 默认分块数 */
const DEFAULT_PARTS = 2;

/** 最大分块数 */
const MAX_PARTS = 5;

// ==================== 类型定义 ====================

/** 自适应分块配置 */
export interface AdaptiveChunkConfig {
  /** 最大 token 数 */
  maxTokens: number;
  /** 安全边际 */
  safetyMargin: number;
  /** 摘要开销 token 数 */
  overheadTokens: number;
  /** 基准比例 */
  baseRatio: number;
  /** 最小比例 */
  minRatio: number;
}

/** 分块比例计算结果 */
export interface ChunkRatioResult {
  /** 实际使用的比例 */
  ratio: number;
  /** 目标每块 token 数 */
  targetChunkTokens: number;
  /** 建议的分块数 */
  suggestedParts: number;
  /** 可用 token 数（减去开销） */
  availableTokens: number;
}

// ==================== 核心计算 ====================

/**
 * 计算自适应分块比例
 *
 * 根据消息总 token 数和上下文窗口大小动态调整：
 * - 消息较少时使用基准比例（40%）
 * - 消息较多时降低比例，增加分块数
 * - 确保不低于最小比例（15%）
 *
 * @param totalTokens - 消息总 token 数
 * @param config - 分块配置
 * @returns 分块比例计算结果
 */
export function computeAdaptiveChunkRatio(
  totalTokens: number,
  config?: Partial<AdaptiveChunkConfig>,
): ChunkRatioResult {
  const maxTokens = config?.maxTokens ?? DEFAULT_CONTEXT_TOKENS;
  const safetyMargin = config?.safetyMargin ?? SAFETY_MARGIN;
  const overheadTokens = config?.overheadTokens ?? SUMMARIZATION_OVERHEAD_TOKENS;
  const baseRatio = config?.baseRatio ?? BASE_CHUNK_RATIO;
  const minRatio = config?.minRatio ?? MIN_CHUNK_RATIO;

  const availableTokens = Math.max(0, maxTokens - overheadTokens);

  // 如果总 token 数在安全范围内，使用基准比例
  if (totalTokens <= availableTokens * safetyMargin) {
    return {
      ratio: baseRatio,
      targetChunkTokens: Math.floor(availableTokens * baseRatio),
      suggestedParts: 1,
      availableTokens,
    };
  }

  // 计算需要的分块数
  const targetChunkTokens = Math.floor(availableTokens * baseRatio);
  const rawParts = Math.ceil(totalTokens / (targetChunkTokens * safetyMargin));
  const suggestedParts = Math.min(Math.max(1, rawParts), MAX_PARTS);

  // 根据分块数调整比例
  const adjustedRatio = Math.max(minRatio, baseRatio / suggestedParts);

  return {
    ratio: adjustedRatio,
    targetChunkTokens: Math.floor(availableTokens * adjustedRatio),
    suggestedParts,
    availableTokens,
  };
}

/**
 * 规范化分块数
 *
 * @param parts - 请求的分块数
 * @param messageCount - 消息数量
 * @returns 规范化后的分块数
 */
export function normalizeParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) return 1;
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

/**
 * 估算消息的 token 数
 *
 * @param message - 消息对象
 * @returns 估算的 token 数
 */
export function estimateMessageTokens(message: unknown): number {
  if (message === null || message === undefined) return 0;
  if (typeof message === 'string') {
    return Math.ceil(message.length / 4);
  }
  try {
    const json = JSON.stringify(message);
    return Math.ceil(json.length / 4);
  } catch {
    return 100;
  }
}

/**
 * 估算消息数组的总 token 数
 *
 * @param messages - 消息数组
 * @returns 总 token 数
 */
export function estimateMessagesTokens(messages: unknown[]): number {
  return messages.reduce((sum: number, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * 检查消息是否超大
 *
 * @param message - 消息对象
 * @param maxTokens - 单条消息最大 token 数
 * @returns 是否超大
 */
export function isOversizedMessage(message: unknown, maxTokens?: number): boolean {
  const limit = maxTokens ?? MAX_SINGLE_MESSAGE_TOKENS;
  return estimateMessageTokens(message) > limit;
}

/**
 * 按比例修剪历史消息
 *
 * 当历史消息 token 数超过上下文窗口时，按比例修剪最早的消息
 *
 * @param messages - 消息数组
 * @param maxHistoryTokens - 历史消息最大 token 数
 * @returns 修剪后的消息
 */
export function pruneHistoryForContextShare(
  messages: unknown[],
  maxHistoryTokens: number,
): { pruned: unknown[]; removed: number; removedTokens: number } {
  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens <= maxHistoryTokens) {
    return { pruned: messages, removed: 0, removedTokens: 0 };
  }

  // 从最旧的消息开始移除
  const pruned: unknown[] = [];
  let prunedTokens = 0;
  let removedCount = 0;
  let removedTokens = 0;

  // 从后向前遍历，保留最新的消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(messages[i]);
    if (prunedTokens + msgTokens > maxHistoryTokens) {
      removedCount = i + 1;
      break;
    }
    pruned.unshift(messages[i]);
    prunedTokens += msgTokens;
  }

  // 计算被移除消息的 token 数
  for (let i = 0; i < removedCount; i++) {
    removedTokens += estimateMessageTokens(messages[i]);
  }

  return { pruned, removed: removedCount, removedTokens };
}

/**
 * 获取默认配置
 */
export function getDefaultChunkConfig(): AdaptiveChunkConfig {
  return {
    maxTokens: DEFAULT_CONTEXT_TOKENS,
    safetyMargin: SAFETY_MARGIN,
    overheadTokens: SUMMARIZATION_OVERHEAD_TOKENS,
    baseRatio: BASE_CHUNK_RATIO,
    minRatio: MIN_CHUNK_RATIO,
  };
}

export const adaptiveChunk = {
  DEFAULT_CONTEXT_TOKENS,
  BASE_CHUNK_RATIO,
  MIN_CHUNK_RATIO,
  SAFETY_MARGIN,
  SUMMARIZATION_OVERHEAD_TOKENS,
  MAX_SINGLE_MESSAGE_TOKENS,
  DEFAULT_RECENT_MESSAGES_KEEP,
  computeAdaptiveChunkRatio,
  normalizeParts,
  estimateMessageTokens,
  estimateMessagesTokens,
  isOversizedMessage,
  pruneHistoryForContextShare,
  getDefaultChunkConfig,
};
