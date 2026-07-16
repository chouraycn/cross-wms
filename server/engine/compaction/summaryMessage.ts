/**
 * Compaction Summary Message — 结构化压缩摘要消息
 *
 * 对齐 OpenClaw agent-core 的 compaction 设计：
 *   - 使用结构化模板（Goal/Progress/Decisions/Next Steps）而非自由文本
 *   - 支持增量更新（previousSummary → 新 summary）
 *   - 包含文件操作清单（readFiles/modifiedFiles）
 *   - 作为特殊 role 注入上下文
 *
 * 与现有 CompactionMessage 的关系：
 *   - CompactionMessage 是通用消息类型（role + content）
 *   - CompactionSummaryMessage 是结构化摘要，序列化后作为 CompactionMessage.content
 */

import type { CompactionMessage } from '../compactionPlanning.js';

// ===================== 结构化摘要类型 =====================

/** 压缩摘要结构 — 对齐 OpenClaw 的结构化模板 */
export interface CompactionSummaryStructure {
  /** 用户目标 / 需求 */
  goal: string;
  /** 当前进展 */
  progress: string;
  /** 关键决策 */
  decisions: string[];
  /** 下一步计划 */
  nextSteps: string[];
  /** WMS 主题（cdf-know 特有） */
  wmsTopic?: string;
  /** 最后一个问题 */
  lastQuestion?: string;
  /** 最新进展（用于快速恢复上下文） */
  latestProgress?: string;
}

/** 文件操作清单 */
export interface CompactionFileManifest {
  /** 读取过的文件 */
  readFiles?: string[];
  /** 修改过的文件 */
  modifiedFiles?: string[];
  /** 创建的文件 */
  createdFiles?: string[];
  /** 删除的文件 */
  deletedFiles?: string[];
}

/** 压缩摘要元数据 */
export interface CompactionSummaryMetadata {
  /** 压缩时间戳 */
  compactedAt: number;
  /** 压缩前消息数 */
  originalMessageCount: number;
  /** 压缩前 token 估算 */
  originalTokenEstimate?: number;
  /** 压缩后 token 估算 */
  compactedTokenEstimate?: number;
  /** 压缩比 */
  compressionRatio?: number;
  /** 保留的最近消息数 */
  keptRecentMessages: number;
  /** 前一次摘要（用于增量更新） */
  previousSummary?: string;
}

/** 完整的压缩摘要消息 */
export interface CompactionSummaryMessage {
  /** 消息 ID */
  id: string;
  /** 消息类型标识 */
  type: 'compaction-summary';
  /** 结构化摘要内容 */
  summary: CompactionSummaryStructure;
  /** 文件操作清单 */
  fileManifest?: CompactionFileManifest;
  /** 元数据 */
  metadata: CompactionSummaryMetadata;
  /** 序列化后的文本内容（用于注入 CompactionMessage.content） */
  serializedContent: string;
}

// ===================== 序列化与反序列化 =====================

/**
 * 将结构化摘要序列化为文本（用于注入 CompactionMessage.content）
 *
 * 格式对齐 OpenClaw 的结构化模板：
 * ```
 * ## 上下文摘要
 *
 * ### 目标
 * {goal}
 *
 * ### 进展
 * {progress}
 *
 * ### 关键决策
 * - {decision1}
 * - {decision2}
 *
 * ### 下一步
 * - {nextStep1}
 * - {nextStep2}
 *
 * ### WMS 主题
 * {wmsTopic}
 *
 * ### 最后问题
 * {lastQuestion}
 *
 * ### 最新进展
 * {latestProgress}
 * ```
 */
export function serializeCompactionSummary(summary: CompactionSummaryStructure): string {
  const lines: string[] = ['## 上下文摘要', ''];

  lines.push('### 目标');
  lines.push(summary.goal || '（未指定）');
  lines.push('');

  lines.push('### 进展');
  lines.push(summary.progress || '（无进展信息）');
  lines.push('');

  if (summary.decisions.length > 0) {
    lines.push('### 关键决策');
    for (const decision of summary.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push('');
  }

  if (summary.nextSteps.length > 0) {
    lines.push('### 下一步');
    for (const step of summary.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }

  if (summary.wmsTopic) {
    lines.push('### WMS 主题');
    lines.push(summary.wmsTopic);
    lines.push('');
  }

  if (summary.lastQuestion) {
    lines.push('### 最后问题');
    lines.push(summary.lastQuestion);
    lines.push('');
  }

  if (summary.latestProgress) {
    lines.push('### 最新进展');
    lines.push(summary.latestProgress);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 创建压缩摘要消息
 */
export function createCompactionSummaryMessage(params: {
  id: string;
  summary: CompactionSummaryStructure;
  fileManifest?: CompactionFileManifest;
  metadata: CompactionSummaryMetadata;
}): CompactionSummaryMessage {
  const serializedContent = serializeCompactionSummary(params.summary);
  return {
    id: params.id,
    type: 'compaction-summary',
    summary: params.summary,
    ...(params.fileManifest ? { fileManifest: params.fileManifest } : {}),
    metadata: params.metadata,
    serializedContent,
  };
}

/**
 * 将 CompactionSummaryMessage 转换为 CompactionMessage（用于注入上下文）
 */
export function summaryMessageToCompactionMessage(
  summaryMsg: CompactionSummaryMessage,
): CompactionMessage {
  return {
    id: summaryMsg.id,
    role: 'system',
    content: summaryMsg.serializedContent,
    metadata: {
      type: 'compaction-summary',
      compactedAt: summaryMsg.metadata.compactedAt,
      originalMessageCount: summaryMsg.metadata.originalMessageCount,
      keptRecentMessages: summaryMsg.metadata.keptRecentMessages,
      ...(summaryMsg.metadata.originalTokenEstimate !== undefined
        ? { originalTokenEstimate: summaryMsg.metadata.originalTokenEstimate }
        : {}),
      ...(summaryMsg.metadata.compactedTokenEstimate !== undefined
        ? { compactedTokenEstimate: summaryMsg.metadata.compactedTokenEstimate }
        : {}),
      ...(summaryMsg.metadata.compressionRatio !== undefined
        ? { compressionRatio: summaryMsg.metadata.compressionRatio }
        : {}),
      ...(summaryMsg.fileManifest ? { fileManifest: summaryMsg.fileManifest } : {}),
    },
  };
}

/**
 * 从 CompactionMessage 反向解析 CompactionSummaryMessage（如果它是摘要消息）
 */
export function tryParseCompactionSummary(msg: CompactionMessage): CompactionSummaryMessage | null {
  if (msg.metadata?.type !== 'compaction-summary') {
    return null;
  }

  const meta = msg.metadata as Record<string, unknown>;
  const metadata: CompactionSummaryMetadata = {
    compactedAt: (meta.compactedAt as number) ?? Date.now(),
    originalMessageCount: (meta.originalMessageCount as number) ?? 0,
    keptRecentMessages: (meta.keptRecentMessages as number) ?? 0,
    ...(meta.originalTokenEstimate !== undefined
      ? { originalTokenEstimate: meta.originalTokenEstimate as number }
      : {}),
    ...(meta.compactedTokenEstimate !== undefined
      ? { compactedTokenEstimate: meta.compactedTokenEstimate as number }
      : {}),
    ...(meta.compressionRatio !== undefined
      ? { compressionRatio: meta.compressionRatio as number }
      : {}),
  };

  return {
    id: msg.id ?? '',
    type: 'compaction-summary',
    summary: {
      goal: '',
      progress: '',
      decisions: [],
      nextSteps: [],
    },
    ...(meta.fileManifest ? { fileManifest: meta.fileManifest as CompactionFileManifest } : {}),
    metadata,
    serializedContent: msg.content,
  };
}

/**
 * 增量更新摘要 — 基于前一次摘要生成新摘要
 *
 * 对齐 OpenClaw 的 previousSummary 增量更新机制：
 *   - 保留 goal（用户目标不变）
 *   - 追加 progress（新进展叠加）
 *   - 追加 decisions（新决策叠加）
 *   - 替换 nextSteps（计划会变化）
 *   - 替换 lastQuestion 和 latestProgress
 */
export function incrementallyUpdateSummary(
  previous: CompactionSummaryStructure,
  current: CompactionSummaryStructure,
): CompactionSummaryStructure {
  return {
    goal: previous.goal || current.goal,
    progress: [previous.progress, current.progress].filter(Boolean).join('\n\n---\n\n'),
    decisions: [...new Set([...previous.decisions, ...current.decisions])],
    nextSteps: current.nextSteps, // 计划会变化，替换
    ...(current.wmsTopic ? { wmsTopic: current.wmsTopic } : previous.wmsTopic ? { wmsTopic: previous.wmsTopic } : {}),
    lastQuestion: current.lastQuestion ?? previous.lastQuestion,
    latestProgress: current.latestProgress ?? previous.latestProgress,
  };
}

export const summaryMessage = {
  serializeCompactionSummary,
  createCompactionSummaryMessage,
  summaryMessageToCompactionMessage,
  tryParseCompactionSummary,
  incrementallyUpdateSummary,
};
