/**
 * 压缩桥接器 — 连接新的压缩系统与现有的 compactionPlanning/contextWindowGuard
 *
 * 功能：
 * - 从 contextWindowGuard 获取模型上下文窗口
 * - 使用 compactionPlanning 的分块逻辑
 * - 通过 Worker 池执行非阻塞分块计算
 * - 集成 multiLevelSummary 的多级摘要策略
 * - 委托 contextCompress 执行实际压缩
 */

import { logger } from '../../logger.js';
import {
  DEFAULT_SAFETY_MARGIN,
  DEFAULT_COMPACTION_TRIGGER_RATIO,
  type ContextWindowInfo,
} from '../contextWindowGuard.js';
import {
  BASE_CHUNK_RATIO,
  MIN_CHUNK_RATIO,
  SUMMARIZATION_OVERHEAD_TOKENS,
} from '../compaction-planning.js';
import { submitChunkTask, type WorkerTaskInput } from './workerPool.js';
import {
  selectSummaryStrategy,
  executeMultiLevelSummary,
  type SummaryResult,
  type SummaryStrategy,
} from './multiLevelSummary.js';
import {
  estimateMessagesTokens as adaptiveEstimateMessagesTokens,
  isOversizedMessage,
  MAX_SINGLE_MESSAGE_TOKENS,
  DEFAULT_RECENT_MESSAGES_KEEP,
} from './adaptiveChunk.js';

/** 压缩桥接配置 */
export interface CompactionBridgeConfig {
  /** 保留最近消息数 */
  keepRecentCount?: number;
  /** 安全边际 */
  safetyMargin?: number;
  /** 摘要开销 token 数 */
  overheadTokens?: number;
  /** 单条消息最大 token 数 */
  maxSingleMessageTokens?: number;
  /** 基准分块比例 */
  baseChunkRatio?: number;
  /** 最小分块比例 */
  minChunkRatio?: number;
}

/** 压缩决策 */
export interface CompactionDecision {
  /** 是否需要压缩 */
  shouldCompact: boolean;
  /** 原因 */
  reason: string;
  /** 当前 token 使用比例 */
  usageRatio: number;
  /** 建议的摘要策略 */
  suggestedStrategy: SummaryStrategy;
}

/** 压缩执行结果 */
export interface CompactionExecutionResult {
  summary: string;
  strategy: SummaryStrategy;
  originalCount: number;
  compactedCount: number;
  fallback: boolean;
  durationMs: number;
  /** 分块数 */
  chunkCount: number;
}

/** 默认配置 */
const DEFAULT_BRIDGE_CONFIG: Required<CompactionBridgeConfig> = {
  keepRecentCount: DEFAULT_RECENT_MESSAGES_KEEP,
  safetyMargin: DEFAULT_SAFETY_MARGIN,
  overheadTokens: SUMMARIZATION_OVERHEAD_TOKENS,
  maxSingleMessageTokens: MAX_SINGLE_MESSAGE_TOKENS,
  baseChunkRatio: BASE_CHUNK_RATIO,
  minChunkRatio: MIN_CHUNK_RATIO,
};

/**
 * 评估是否需要压缩
 *
 * @param messages - 消息列表
 * @param contextWindow - 上下文窗口信息
 * @param config - 桥接配置
 * @returns 压缩决策
 */
export function evaluateCompactionNeed(
  messages: unknown[],
  contextWindow: ContextWindowInfo,
  config?: CompactionBridgeConfig,
): CompactionDecision {
  const cfg = { ...DEFAULT_BRIDGE_CONFIG, ...config };
  const totalTokens = adaptiveEstimateMessagesTokens(messages);
  const maxTokens = contextWindow.totalTokens;
  const usageRatio = maxTokens > 0 ? totalTokens / maxTokens : 0;

  // 检查是否超过触发阈值
  if (usageRatio >= DEFAULT_COMPACTION_TRIGGER_RATIO) {
    const suggestedStrategy = selectSummaryStrategy({
      messageCount: messages.length,
      estimatedTokens: totalTokens,
      maxTokens,
      safetyMargin: cfg.safetyMargin,
    });

    return {
      shouldCompact: true,
      reason: `token 使用率 ${Math.round(usageRatio * 100)}% 超过阈值 ${Math.round(DEFAULT_COMPACTION_TRIGGER_RATIO * 100)}%`,
      usageRatio,
      suggestedStrategy,
    };
  }

  return {
    shouldCompact: false,
    reason: `token 使用率 ${Math.round(usageRatio * 100)}% 低于阈值`,
    usageRatio,
    suggestedStrategy: 'single',
  };
}

/**
 * 执行压缩
 *
 * @param messages - 消息列表
 * @param contextWindow - 上下文窗口信息
 * @param generateSummary - LLM 摘要生成函数
 * @param config - 桥接配置
 * @returns 压缩结果
 */
export async function executeCompaction(
  messages: unknown[],
  contextWindow: ContextWindowInfo,
  generateSummary: (messages: unknown[]) => Promise<string>,
  config?: CompactionBridgeConfig,
): Promise<CompactionExecutionResult> {
  const cfg = { ...DEFAULT_BRIDGE_CONFIG, ...config };
  const startTime = Date.now();

  // 1. 评估压缩需求
  const decision = evaluateCompactionNeed(messages, contextWindow, cfg);
  if (!decision.shouldCompact) {
    return {
      summary: 'No compaction needed.',
      strategy: 'single',
      originalCount: messages.length,
      compactedCount: 0,
      fallback: false,
      durationMs: Date.now() - startTime,
      chunkCount: 0,
    };
  }

  logger.info(
    `[CompactionBridge] 开始压缩: ${messages.length} 条消息, 策略=${decision.suggestedStrategy}, ` +
    `使用率=${Math.round(decision.usageRatio * 100)}%`,
  );

  // 2. 通过 Worker 池计算分块
  const workerInput: WorkerTaskInput = {
    messages,
    maxTokens: contextWindow.totalTokens,
    safetyMargin: cfg.safetyMargin,
    overheadTokens: cfg.overheadTokens,
    maxSingleMessageTokens: cfg.maxSingleMessageTokens,
  };

  let chunks: unknown[][] | undefined;
  let oversizedPlan: { smallMessages: unknown[]; oversizedNotes: string[] } | undefined;

  try {
    const workerResult = await submitChunkTask(workerInput);
    if (workerResult.kind === 'chunk-plan') {
      chunks = workerResult.plan.chunks;
      logger.debug(`[CompactionBridge] Worker 分块完成: ${workerResult.plan.chunks.length} 块`);
    } else if (workerResult.kind === 'oversized-plan') {
      oversizedPlan = workerResult.plan;
      logger.debug(`[CompactionBridge] Worker 超大降级: ${workerResult.plan.smallMessages.length} 条小消息`);
    } else if (workerResult.kind === 'error') {
      logger.warn(`[CompactionBridge] Worker 错误，降级为主线程: ${workerResult.error}`);
    }
  } catch (err) {
    logger.warn('[CompactionBridge] Worker 执行失败，降级为主线程分块', err);
  }

  // 3. 执行多级摘要
  const summaryResult: SummaryResult = await executeMultiLevelSummary(
    {
      messages,
      strategy: decision.suggestedStrategy,
      maxTokens: contextWindow.totalTokens,
      keepRecentCount: cfg.keepRecentCount,
    },
    generateSummary,
    chunks,
    oversizedPlan,
  );

  const result: CompactionExecutionResult = {
    summary: summaryResult.summary,
    strategy: summaryResult.strategy,
    originalCount: summaryResult.originalCount,
    compactedCount: summaryResult.compactedCount,
    fallback: summaryResult.fallback,
    durationMs: Date.now() - startTime,
    chunkCount: chunks?.length ?? 0,
  };

  logger.info(
    `[CompactionBridge] 压缩完成: ${result.compactedCount} → 1 条摘要, ` +
    `策略=${result.strategy}, 分块=${result.chunkCount}, ` +
    `降级=${result.fallback}, 耗时=${result.durationMs}ms`,
  );

  return result;
}

/**
 * 获取压缩诊断信息
 *
 * @param messages - 消息列表
 * @param contextWindow - 上下文窗口信息
 * @returns 诊断信息
 */
export function getCompactionDiagnostics(
  messages: unknown[],
  contextWindow: ContextWindowInfo,
): {
  totalMessages: number;
  totalTokens: number;
  contextWindow: number;
  usageRatio: number;
  oversizedMessages: number;
  shouldCompact: boolean;
} {
  const totalTokens = adaptiveEstimateMessagesTokens(messages);
  const oversizedCount = messages.filter((msg) =>
    isOversizedMessage(msg),
  ).length;

  const decision = evaluateCompactionNeed(messages, contextWindow);

  return {
    totalMessages: messages.length,
    totalTokens,
    contextWindow: contextWindow.totalTokens,
    usageRatio: decision.usageRatio,
    oversizedMessages: oversizedCount,
    shouldCompact: decision.shouldCompact,
  };
}
