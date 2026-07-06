/**
 * StreamExecutor — 统一执行器
 *
 * 实现 "流式优先 + 后台增强" (Stream-First, Enhance-Behind) 三阶段执行模型：
 *
 * Phase 0（立即流式）：收到请求即刻用原始消息+最近5条历史调 LLM，用户 ~1s 看到首字
 * Phase 1（后台增强）：与 Phase 0 并行执行上下文压缩、记忆检索、复杂度评估
 * Phase 2（ReAct 补充）：仅当复杂度评估判定"复杂"时启动简化版 ReAct 循环
 *
 * Phase 0 切换策略：平滑过渡——Phase 0 自然结束后，如果后台判定"复杂"，
 * 在后续消息中启动 ReAct 补充。
 */

import type { Response } from 'express';
import type { ModelCallConfig, MessageContent, ToolCall, AIResponse } from '../aiClient.js';
import { ExecutionStrategyFactory, ExecutionMode } from './executionStrategy.js';
import type { ExecutionStrategyOptions } from './executionStrategy.js';
import type { ToolExecutionResult } from './toolExecutor.js';
import { enhanceInBackground, type EnhancementResult } from './contextEnhancer.js';
import { sanitizeToolMessages } from './contextTruncate.js';
import { TimerManager } from '../sse/timerManager.js';
import { sendSSE, sendDebugSSE, sendDoneAndEnd } from '../sse/sseTypes.js';
import { type ToolProfileId } from './toolProfiles.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 执行结果 */
export interface ExecuteChatResult {
  content: string;
  thinkingContent: string;
  hasThinking: boolean;
  thinkingDuration: number;
  /** thinking 加密签名（Anthropic thinking content block 提取，可回传 API） */
  thinkingSignature?: string;
  /** 安全脱敏标记（redacted_thinking 块为 true） */
  redacted?: boolean;
  /** 工具调用记录（ToolExecutionResult 格式） */
  toolCalls: ToolExecutionResult['toolCalls'];
  usage?: AIResponse['usage'];
  enhancement: EnhancementResult;
  fallbackModel?: string;
  fallbackReason?: string;
}

/** 回调集合 */
export interface ExecuteChatCallbacks {
  /** 文本块回调 */
  onChunk?: (text: string) => void;
  /** 思考块回调 */
  onThinking?: (text: string) => void;
  /** 工具调用回调 */
  onToolCall?: (toolCall: ToolCall, result: string) => void;
  /** SSE 事件回调（由策略内部触发的事件） */
  onSSEEvent?: (event: Record<string, unknown>) => void;
  /** Agent 相关回调 */
  onAgentStart?: (agentId: string, agentRole: string, taskDescription: string, subTaskId?: string) => void;
  onAgentEnd?: (agentId: string, agentRole: string, status: 'success' | 'failed' | 'timeout', duration?: number, error?: string) => void;
  onSubtaskCreate?: (subTaskId: string, description: string, dependsOn?: string[], priority?: number) => void;
  onSubtaskAssign?: (subTaskId: string, agentId: string, agentRole: string) => void;
  onSubtaskComplete?: (subTaskId: string, description: string, status: 'completed' | 'failed', agentId: string, duration?: number, resultSummary?: string) => void;
  onReflect?: (reflection: Record<string, unknown>) => void;
  onPlan?: (plan: Record<string, unknown>) => void;
  /** 速率限制回调 */
  onRateLimit?: () => Promise<{ apiKey: string; keyIndex: number } | null>;
}

/** 执行参数 */
export interface ExecuteChatParams {
  /** 会话 ID */
  sessionId: string;
  /** 用户消息文本 */
  message: string;
  /** 模型 ID */
  model: string;
  /** 模型名称 */
  modelName: string;
  /** 最终模型配置（含 API Key、temperature 等） */
  modelConfig: ModelCallConfig;
  /** 构建好的 API 消息列表 */
  apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  /** Express 响应对象（可选：传入则写 SSE，不传则只走 callbacks） */
  res?: Response;
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** Timer 管理器 */
  timerManager: TimerManager;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 已授权工具缓存 */
  approvedToolsCache?: Set<string>;
  /** 模型能力标签 */
  modelCapabilities?: string[];
  /** 上下文窗口大小 */
  ctxWindow: number;
  /** 最大 token 数 */
  ctxMaxTokens: number;
  /** 估算工具数量 */
  estimatedToolsCount: number;
  /** 回调集合 */
  callbacks: ExecuteChatCallbacks;
  /** 是否使用队列模式（影响日志标记） */
  fromQueue?: boolean;
  /** 工具 Profile */
  toolProfile?: ToolProfileId;
  /** 上下文压缩配置 */
  compaction?: {
    enabled?: boolean;
    strategy?: string;
    thresholdRatio?: number;
    preserveRecent?: number;
  };
}

// ===================== 统一执行入口 =====================

/**
 * 统一执行入口 — 替代 handleChat + executeFromQueue 中的核心执行逻辑
 *
 * 三阶段执行：
 * - Phase 0: 立即用原始消息+最近5条历史调 LLM 流式输出
 * - Phase 1: Promise.all 并行执行上下文压缩/记忆检索/复杂度评估
 * - Phase 2: Phase 0 完成后，如果复杂度=complex，启动简化 ReAct
 *
 * @returns 统一执行结果
 */
export async function executeChat(params: ExecuteChatParams): Promise<ExecuteChatResult> {
  const { res, timerManager, modelConfig, apiMessages, callbacks } = params;
  const hasRes = !!res;
  const tag = params.fromQueue ? '[QueueExecutor]' : '[StreamExecutor]';

  // 启动 keepAlive 心跳
  timerManager.start('main');

  let fullContent = '';
  let thinkingContent = '';
  let hasThinking = false;
  let thinkingStartTime: number | null = null;
  let thinkingChunkCount = 0;
  let toolCallsResult: ToolExecutionResult['toolCalls'] = [];
  // 细粒度 thinking 事件状态
  let thinkingStarted = false;
  let thinkingSignature: string | undefined;
  let redactedThinking: boolean | undefined;

  // ============== Phase 1: 后台增强（与 Phase 0 并行） ==============
  // 提取用户最新消息文本用于增强
  const latestUserMsg = [...apiMessages].reverse().find((m) => m.role === 'user');
  const userMessageText = params.message || (typeof latestUserMsg?.content === 'string' ? latestUserMsg.content : '');

  const enhancementPromise = enhanceInBackground({
    messages: apiMessages,
    modelConfig,
    ctxWindow: params.ctxWindow,
    ctxMaxTokens: params.ctxMaxTokens,
    estimatedToolsCount: params.estimatedToolsCount,
    userMessage: userMessageText,
    sessionId: params.sessionId,
  }).catch((err) => {
    logger.warn(`${tag} 后台增强整体失败:`, err instanceof Error ? err.message : String(err));
    return {} as EnhancementResult;
  });

  // ============== Phase 0: 立即流式 ==============
  // 乐观假设简单：直接用原始消息调 LLM，不等上下文压缩或记忆检索
  logger.debug(`${tag} Phase 0 启动立即流式`);

  try {
    // 使用 strategy.execute 执行（统一路径，修复原 handleChat 用 executeToolLoop 的不一致）
    const strategy = ExecutionStrategyFactory.create(params.executionMode);

    // 构建策略选项
    const strategyOptions: ExecutionStrategyOptions = {
      modelConfig,
      messages: sanitizeToolMessages(apiMessages) as Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
      maxToolTurns: 10,
      signal: params.signal ?? new AbortController().signal,
      executionMode: params.executionMode,
      onSSEEvent: (event: Record<string, unknown>) => {
        // 策略内部事件：核心类型与多模态类型直接发送，其余走 debug 通道
        const eventType = event.type as string;
        if (hasRes && [
          'init', 'text', 'thinking', 'tool_call', 'done', 'error',
          'image_start', 'image_delta', 'image_end',
          'audio_start', 'audio_delta', 'audio_end',
        ].includes(eventType)) {
          sendSSE(res!, event);
        } else if (hasRes) {
          sendDebugSSE(res!, event);
        }
        callbacks.onSSEEvent?.(event);
      },
      onChunk: (chunk: string) => {
        fullContent += chunk;
        if (hasRes) sendSSE(res!, { type: 'text', content: chunk });
        callbacks.onChunk?.(chunk);
      },
      onThinking: (thinkingChunk: string) => {
        if (!hasThinking) {
          hasThinking = true;
          thinkingStartTime = Date.now();
        }
        // 细粒度 thinking.start（首个 chunk 时发送一次，含 signature 如果有）
        if (!thinkingStarted) {
          thinkingStarted = true;
          if (hasRes) sendSSE(res!, {
            type: 'thinking.start',
            contentIndex: 0,
            ...(thinkingSignature ? { thinkingSignature } : {}),
            ...(redactedThinking ? { redacted: true } : {}),
          });
        }
        // 细粒度 thinking.delta
        if (hasRes) sendSSE(res!, { type: 'thinking.delta', contentIndex: 0, content: thinkingChunk });
        thinkingContent += thinkingChunk;
        thinkingChunkCount++;
        // 保留原有 thinking 事件（向后兼容）
        if (hasRes) sendSSE(res!, { type: 'thinking', content: thinkingChunk });
        callbacks.onThinking?.(thinkingChunk);
      },
      onToolCall: (toolCall: ToolCall, result: string) => {
        if (hasRes) sendSSE(res!, {
          type: 'tool_call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          toolArgs: toolCall.function.arguments,
          toolResult: result,
        });
        // 工具审计事件合并到 debug 通道
        const isDenied = result.includes('用户拒绝了工具');
        const isError = !isDenied && result.includes('"error"');
        const auditResult = isDenied ? 'denied' : isError ? 'error' : 'success';
        if (hasRes) sendDebugSSE(res!, {
          type: 'tool_audit',
          toolName: toolCall.function.name,
          result: auditResult,
          timestamp: Date.now(),
        });
        callbacks.onToolCall?.(toolCall, result);
      },
      onAgentStart: callbacks.onAgentStart,
      onAgentEnd: callbacks.onAgentEnd,
      onSubtaskCreate: callbacks.onSubtaskCreate,
      onSubtaskAssign: callbacks.onSubtaskAssign,
      onSubtaskComplete: callbacks.onSubtaskComplete,
      onReflect: callbacks.onReflect,
      onPlan: callbacks.onPlan,
      modelCapabilities: params.modelCapabilities ?? modelConfig.capabilities ?? [],
      approvedToolsCache: params.approvedToolsCache,
      onRateLimit: callbacks.onRateLimit,
      toolProfile: params.toolProfile,
      compaction: params.compaction,
    };

    const toolResult: ToolExecutionResult = await strategy.execute(strategyOptions);

    fullContent = toolResult.content;
    toolCallsResult = toolResult.toolCalls || [];
    // 上抛 thinking signature（来自 Anthropic thinking content block）
    if (toolResult.thinkingSignature) {
      thinkingSignature = toolResult.thinkingSignature;
      redactedThinking = toolResult.redacted;
    }

    // 处理空内容回退
    if (!fullContent && thinkingContent) {
      const trimmedThinking = thinkingContent.trim();
      if (trimmedThinking) {
        const paragraphs = trimmedThinking.split(/\n{2,}|\n(?=[A-Z\u4e00-\u9fff])/);
        const lastParagraph = paragraphs.filter((p) => p.trim().length > 20).pop() || trimmedThinking;
        fullContent = lastParagraph.length > 800
          ? '（思考摘要）\n\n' + lastParagraph.slice(-800)
          : '（思考摘要）\n\n' + lastParagraph;
        // 通过 onChunk 回调发射回退内容，确保前端能收到
        callbacks.onChunk?.(fullContent);
        callbacks.onEvent?.({ type: 'text', content: fullContent });
      }
    }

    if (!fullContent && !thinkingContent?.trim()) {
      logger.warn(`${tag} 模型返回空内容，无文本也无思考，sessionId=${params.sessionId} model=${params.model}`);
      fullContent = '（模型未返回内容，可能是请求超时或服务异常，请重试）';
      // 通过 onChunk 回调发射回退内容，确保前端能收到
      callbacks.onChunk?.(fullContent);
      callbacks.onEvent?.({ type: 'text', content: fullContent });
    }
  } catch (error) {
    logger.error(`${tag} Phase 0 执行失败:`, error);
    throw error;
  }

  // ============== 等待 Phase 1 完成 ==============
  const enhancement = await enhancementPromise;

  // ============== Phase 2: ReAct 补充（仅当复杂度=complex） ==============
  if (enhancement.complexity?.level === 'complex' && !params.fromQueue) {
    logger.info(`${tag} Phase 2: 复杂度评估为 complex (${enhancement.complexity.reason})，后续消息将启动 ReAct 补充`);
    // 发送调试事件通知前端复杂度评估结果
    if (hasRes) sendDebugSSE(res!, {
      type: 'complexity_assessment',
      level: enhancement.complexity.level,
      reason: enhancement.complexity.reason,
      estimatedSteps: enhancement.complexity.estimatedSteps,
    });
  }

  // 停止主心跳
  timerManager.stop('main');

  const thinkingDuration = hasThinking && thinkingStartTime ? Date.now() - thinkingStartTime : 0;

  // 细粒度 thinking.complete（含 thinkingSignature 和 thinkingDuration）
  if (thinkingStarted && hasRes) {
    sendSSE(res!, {
      type: 'thinking.complete',
      contentIndex: 0,
      thinkingDuration,
      ...(thinkingSignature ? { thinkingSignature } : {}),
      ...(redactedThinking ? { redacted: true } : {}),
    });
  }

  return {
    content: fullContent,
    thinkingContent,
    hasThinking,
    thinkingDuration,
    thinkingSignature,
    redacted: redactedThinking,
    toolCalls: toolCallsResult,
    enhancement,
  };
}

// ===================== 辅助函数 =====================

/**
 * 构建最近 N 条历史消息（用于 Phase 0 快速启动）
 *
 * 从完整消息列表中提取最近 N 条非系统消息，
 * 附加在最前面的系统消息之后。
 */
export function buildRecentHistory(
  fullMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  recentCount: number = 5,
): Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> {
  // 分离系统消息和非系统消息
  const systemMessages = fullMessages.filter((m) => m.role === 'system');
  const nonSystemMessages = fullMessages.filter((m) => m.role !== 'system');

  // 取最近 N 条非系统消息
  const recentNonSystem = nonSystemMessages.slice(-recentCount);

  // 系统消息 + 最近 N 条
  return [...systemMessages, ...recentNonSystem];
}

/**
 * 安全发送 done 事件并结束响应
 *
 * 封装 sendDoneAndEnd，确保 timerManager 先停止。
 */
export async function finishStream(
  res: Response,
  timerManager: TimerManager,
  options: {
    errorCode?: string | null;
    errorMessage?: string | null;
    thinkingDuration?: number;
    usage?: unknown;
    fallbackModel?: string;
    fallbackReason?: string;
  } = {},
): Promise<void> {
  timerManager.stopAll();
  await sendDoneAndEnd(res, options);
}
