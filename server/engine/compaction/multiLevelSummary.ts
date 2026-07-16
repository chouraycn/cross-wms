/**
 * 多级摘要策略 — 参考 OpenClaw compaction.ts
 *
 * 实现多策略摘要生成与降级处理：
 * - 单块摘要：消息较少时直接生成
 * - 多块分块摘要：消息较多时分块生成后合并
 * - 超大降级：超大消息单独处理
 * - 合并策略：将多个部分摘要合并为连贯摘要
 */

import { logger } from '../../logger.js';

// ==================== 类型定义 ====================

/** 摘要策略 */
export type SummaryStrategy = 'single' | 'split' | 'oversized-fallback';

/** 摘要请求 */
export interface SummaryRequest {
  messages: unknown[];
  strategy: SummaryStrategy;
  maxTokens: number;
  /** 保留的最近消息数 */
  keepRecentCount: number;
}

/** 摘要结果 */
export interface SummaryResult {
  summary: string;
  strategy: SummaryStrategy;
  originalCount: number;
  compactedCount: number;
  /** 是否使用了降级 */
  fallback: boolean;
  /** 处理时长（毫秒） */
  durationMs: number;
}

/** 部分摘要 */
export interface PartialSummary {
  chunkIndex: number;
  summary: string;
  tokenCount: number;
}

/** 合并指令 */
const MERGE_INSTRUCTIONS = [
  '将以下部分摘要合并为一个连贯的摘要。',
  '',
  '必须保留：',
  '- 活跃任务及其当前状态（进行中、阻塞、待处理）',
  '- 批量操作进度（如 "5/17 项已完成"）',
  '- 用户最后请求的内容和正在执行的操作',
  '- 已做出的决策及其理由',
  '- 待办事项、未解决的问题和约束条件',
  '- 任何承诺或后续跟进步骤',
  '',
  '合并时应：',
  '- 去除重复信息',
  '- 保持时间顺序',
  '- 优先保留最新和最重要的信息',
  '- 简洁但不丢失关键细节',
].join('\n');

// ==================== 策略选择 ====================

/** 根据消息数量和 token 预估选择摘要策略 */
export function selectSummaryStrategy(params: {
  messageCount: number;
  estimatedTokens: number;
  maxTokens: number;
  safetyMargin: number;
}): SummaryStrategy {
  const { messageCount, estimatedTokens, maxTokens, safetyMargin } = params;
  const effectiveLimit = maxTokens * safetyMargin;

  // token 数在安全范围内，使用单块
  if (estimatedTokens <= effectiveLimit) {
    return 'single';
  }

  // 消息数较少但 token 过大，使用超大降级
  if (messageCount <= 5 && estimatedTokens > effectiveLimit * 2) {
    return 'oversized-fallback';
  }

  // 其他情况使用分块
  return 'split';
}

// ==================== 摘要生成 ====================

/** 生成单块摘要 */
export async function generateSingleSummary(
  messages: unknown[],
  generateSummary: (messages: unknown[]) => Promise<string>,
): Promise<string> {
  if (messages.length === 0) {
    return 'No prior history.';
  }
  return generateSummary(messages);
}

/** 生成多块分块摘要 */
export async function generateSplitSummary(
  chunks: unknown[][],
  generateSummary: (messages: unknown[]) => Promise<string>,
): Promise<PartialSummary[]> {
  const summaries: PartialSummary[] = [];

  for (let i = 0; i < chunks.length; i++) {
    logger.debug(`[MultiLevelSummary] 生成第 ${i + 1}/${chunks.length} 块摘要`);
    const summary = await generateSummary(chunks[i]);
    summaries.push({
      chunkIndex: i,
      summary,
      tokenCount: Math.ceil(summary.length / 4),
    });
  }

  return summaries;
}

/** 合并部分摘要 */
export async function mergePartialSummaries(
  partials: PartialSummary[],
  generateSummary: (messages: unknown[]) => Promise<string>,
): Promise<string> {
  if (partials.length === 0) {
    return 'No prior history.';
  }

  if (partials.length === 1) {
    return partials[0].summary;
  }

  // 将部分摘要作为消息传递给 LLM 进行合并
  const mergeMessages = [
    { role: 'system', content: MERGE_INSTRUCTIONS },
    ...partials.map((p) => ({
      role: 'user' as const,
      content: `部分摘要 ${p.chunkIndex + 1}:\n${p.summary}`,
    })),
  ];

  return generateSummary(mergeMessages);
}

/** 生成超大降级摘要 */
export async function generateOversizedFallbackSummary(
  smallMessages: unknown[],
  oversizedNotes: string[],
  generateSummary: (messages: unknown[]) => Promise<string>,
): Promise<string> {
  const parts: string[] = [];

  if (smallMessages.length > 0) {
    const smallSummary = await generateSummary(smallMessages);
    parts.push(smallSummary);
  }

  if (oversizedNotes.length > 0) {
    parts.push(`超大消息备注:\n${oversizedNotes.join('\n')}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : 'No prior history.';
}

// ==================== 完整摘要流程 ====================

/**
 * 执行完整的多级摘要流程
 *
 * @param request - 摘要请求
 * @param generateSummary - LLM 摘要生成函数
 * @param chunks - 分块结果（如果策略为 split）
 * @param oversizedPlan - 超大降级计划（如果策略为 oversized-fallback）
 */
export async function executeMultiLevelSummary(
  request: SummaryRequest,
  generateSummary: (messages: unknown[]) => Promise<string>,
  chunks?: unknown[][],
  oversizedPlan?: { smallMessages: unknown[]; oversizedNotes: string[] },
): Promise<SummaryResult> {
  const startTime = Date.now();
  const { messages, strategy, keepRecentCount } = request;

  // 分离需要压缩的消息和保留的消息
  const toCompress = messages.slice(0, messages.length - keepRecentCount);
  const toKeep = messages.slice(messages.length - keepRecentCount);

  let summary: string;
  let fallback = false;

  try {
    switch (strategy) {
      case 'single': {
        summary = await generateSingleSummary(toCompress, generateSummary);
        break;
      }

      case 'split': {
        if (!chunks || chunks.length === 0) {
          // 没有提供分块，降级为单块
          logger.warn('[MultiLevelSummary] 分块策略未提供分块数据，降级为单块');
          summary = await generateSingleSummary(toCompress, generateSummary);
          fallback = true;
        } else {
          const partials = await generateSplitSummary(chunks, generateSummary);
          summary = await mergePartialSummaries(partials, generateSummary);
        }
        break;
      }

      case 'oversized-fallback': {
        if (!oversizedPlan) {
          // 没有提供降级计划，降级为单块
          logger.warn('[MultiLevelSummary] 超大降级策略未提供计划，降级为单块');
          summary = await generateSingleSummary(toCompress, generateSummary);
          fallback = true;
        } else {
          summary = await generateOversizedFallbackSummary(
            oversizedPlan.smallMessages,
            oversizedPlan.oversizedNotes,
            generateSummary,
          );
          fallback = true;
        }
        break;
      }

      default: {
        summary = await generateSingleSummary(toCompress, generateSummary);
      }
    }
  } catch (err) {
    logger.error('[MultiLevelSummary] 摘要生成失败，使用降级摘要', err);
    summary = `摘要生成失败: ${err instanceof Error ? err.message : String(err)}`;
    fallback = true;
  }

  // 附加保留的消息信息
  if (toKeep.length > 0) {
    summary += `\n\n[最近 ${toKeep.length} 条消息已保留]`;
  }

  return {
    summary,
    strategy,
    originalCount: messages.length,
    compactedCount: toCompress.length,
    fallback,
    durationMs: Date.now() - startTime,
  };
}

export const multiLevelSummary = {
  selectSummaryStrategy,
  generateSingleSummary,
  generateSplitSummary,
  mergePartialSummaries,
  generateOversizedFallbackSummary,
  executeMultiLevelSummary,
};
