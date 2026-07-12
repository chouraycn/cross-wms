/**
 * ContextEnhancer — 后台增强器
 *
 * 与 Phase 0（立即流式）并行执行上下文增强任务，不阻塞流式输出。
 *
 * 三个并行任务：
 * 1. 上下文压缩（compressContextWithSummary）— 不阻塞
 * 2. 语义记忆检索（searchMemory）— 5s 超时
 * 3. 复杂度评估（assessComplexity）— 轻量版，基于规则
 *
 * 结果通过回调通知，不影响 Phase 0 流式。
 */

import { compressContextWithSummary } from './contextCompress.js';
import { truncateContextForModel } from './contextTruncate.js';
import { searchMemory, type VecSearchResult } from './vecMemoryStore.js';
import { MultilingualIntent } from './multilingualIntent.js';
import type { ModelCallConfig, MessageContent } from '../aiClient.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 复杂度等级 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

/** 复杂度评估结果 */
export interface ComplexityResult {
  level: ComplexityLevel;
  estimatedSteps: number;
  reason: string;
  recommendedMode: string;
}

/** 增强结果 */
export interface EnhancementResult {
  /** 压缩后的消息列表（如果压缩成功） */
  compressedMessages?: Array<{ role: string; content: MessageContent; tool_calls?: unknown[]; tool_call_id?: string }>;
  /** 是否发生了压缩 */
  compressed?: boolean;
  /** 语义记忆检索结果 */
  memories?: VecSearchResult[];
  /** 复杂度评估结果 */
  complexity?: ComplexityResult;
}

/** 后台增强参数 */
export interface EnhanceParams {
  /** 待增强的消息列表 */
  messages: Array<{ role: string; content: MessageContent; tool_calls?: unknown[]; tool_call_id?: string }>;
  /** 模型配置（用于压缩调用的 LLM） */
  modelConfig: ModelCallConfig;
  /** 上下文窗口大小 */
  ctxWindow: number;
  /** 最大 token 数 */
  ctxMaxTokens: number;
  /** 估算的工具数量 */
  estimatedToolsCount: number;
  /** 用户最新消息文本 */
  userMessage: string;
  /** 会话 ID */
  sessionId: string;
}

// ===================== 轻量复杂度评估 =====================

/** 多语言意图识别器实例（复用） */
const multilingualIntent = new MultilingualIntent();

/**
 * 轻量复杂度评估 — 基于规则的快速评估
 *
 * 不调用 LLM，仅基于消息特征和意图识别评估复杂度。
 * 这是复杂度评估的单一事实来源（single source of truth），
 * executionStrategy 直接复用本实现，避免重复实现与循环依赖。
 */
export function assessComplexity(
  messages: Array<{ role: string; content: MessageContent }>,
  userMessage: string,
): ComplexityResult {
  const toolCallCount = messages.filter((m) => m.role === 'tool').length;
  const intent = multilingualIntent.recognize(userMessage);

  // 复杂任务：多步骤 + 多工具调用
  if (toolCallCount >= 5 || (intent.isMultiStep && intent.estimatedSteps >= 4)) {
    return {
      level: 'complex',
      estimatedSteps: Math.max(intent.estimatedSteps, 6),
      reason: `多步骤复杂任务 (意图: ${intent.primaryIntent}, 语言: ${intent.detectedLanguage})`,
      recommendedMode: 'react',
    };
  }

  // 中等任务
  if (toolCallCount >= 2 || intent.intents.some((i) => ['query', 'analyze', 'compare'].includes(i))) {
    return {
      level: 'moderate',
      estimatedSteps: Math.max(intent.estimatedSteps, 3),
      reason: `中等复杂任务 (意图: ${intent.primaryIntent}, 语言: ${intent.detectedLanguage})`,
      recommendedMode: 'planner',
    };
  }

  // 简单任务
  return {
    level: 'simple',
    estimatedSteps: intent.estimatedSteps || 1,
    reason: `简单任务 (意图: ${intent.primaryIntent}, 语言: ${intent.detectedLanguage})`,
    recommendedMode: 'observer',
  };
}

// ===================== 后台增强主函数 =====================

/**
 * 后台并行执行上下文增强
 *
 * 与 Phase 0 流式并行执行，不阻塞流式输出。
 * 三个任务并行：上下文压缩 + 语义记忆检索 + 复杂度评估
 *
 * @returns EnhancementResult — 任何子任务失败不影响其他任务
 */
export async function enhanceInBackground(params: EnhanceParams): Promise<EnhancementResult> {
  const result: EnhancementResult = {};

  // 三个并行任务，各自独立 catch，任何失败不影响其他
  const [compressResult, memoryResult, complexityResult] = await Promise.all([
    // 任务 1：上下文压缩
    compressInBackground(params).catch((err) => {
      logger.warn('[ContextEnhancer] 上下文压缩失败（已跳过）:', err instanceof Error ? err.message : String(err));
      return null;
    }),
    // 任务 2：语义记忆检索（5s 超时）
    searchMemoryInBackground(params).catch((err) => {
      logger.warn('[ContextEnhancer] 语义记忆检索失败（已跳过）:', err instanceof Error ? err.message : String(err));
      return null;
    }),
    // 任务 3：复杂度评估（纯本地计算，不会失败）
    Promise.resolve(assessComplexity(params.messages, params.userMessage)),
  ]);

  if (compressResult) {
    result.compressedMessages = compressResult.messages as Array<{ role: string; content: MessageContent; tool_calls?: unknown[]; tool_call_id?: string }>;
    result.compressed = compressResult.compressed || compressResult.truncated;
  }

  if (memoryResult && memoryResult.length > 0) {
    result.memories = memoryResult;
  }

  result.complexity = complexityResult;

  return result;
}

// ===================== 子任务实现 =====================

/**
 * 后台上下文压缩
 *
 * 尝试使用 LLM 压缩上下文，失败时降级为简单截断。
 */
async function compressInBackground(
  params: EnhanceParams,
): Promise<{ messages: unknown[]; compressed?: boolean; truncated?: boolean }> {
  try {
    const compressResult = await compressContextWithSummary(
      params.messages as Parameters<typeof compressContextWithSummary>[0],
      params.ctxWindow,
      params.ctxMaxTokens,
      params.estimatedToolsCount,
      params.modelConfig,
    );
    return {
      messages: compressResult.messages,
      compressed: compressResult.compressed,
      truncated: compressResult.truncated,
    };
  } catch {
    // 压缩失败，降级为简单截断
    const truncated = truncateContextForModel(
      params.messages as Parameters<typeof truncateContextForModel>[0],
      params.ctxWindow,
      params.ctxMaxTokens,
      params.estimatedToolsCount,
    );
    return {
      messages: truncated.messages,
      truncated: truncated.truncated,
    };
  }
}

/**
 * 后台语义记忆检索（5s 超时）
 *
 * 使用 Promise.race 实现超时控制，超时返回空数组。
 */
async function searchMemoryInBackground(params: EnhanceParams): Promise<VecSearchResult[]> {
  if (!params.userMessage || typeof params.userMessage !== 'string') {
    return [];
  }

  return Promise.race([
    searchMemory(params.userMessage, 5, { sessionId: params.sessionId }),
    new Promise<VecSearchResult[]>((resolve) => setTimeout(() => resolve([]), 5000)),
  ]);
}

/**
 * 将记忆结果格式化为系统消息内容
 *
 * 提取为公共函数，供 streamExecutor 和 chatService 共用。
 */
export function formatMemoryContext(memories: VecSearchResult[]): string | null {
  if (!memories || memories.length === 0) return null;

  const totalChars = memories.reduce((sum, r) => {
    const text = r.text || '';
    return sum + text.length;
  }, 0);
  const totalTokens = Math.ceil(totalChars / 1.5);
  if (totalTokens > 500) return null;

  return memories
    .map((r) => {
      const category = (r.metadata?.category as string) || 'memory';
      return `[${category}] ${r.text} (相似度: ${r.similarity.toFixed(2)})`;
    })
    .join('\n');
}
