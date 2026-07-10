/**
 * Chat Service — 聊天服务核心
 *
 * v9.0: AI 对话流程简化重构
 * - 合并 handleChat + executeFromQueue 为统一的 executeChat 调用
 * - SSE 事件精简：24 种 → 7 种核心事件
 * - 降级逻辑统一：提取 handleFallback 公共函数
 * - Timer 管理统一：使用 TimerManager
 * - 公共函数提取：rebuildToolCalls, hasImageAttachment, detectVisionModel
 * - 语义记忆检索提取：使用 contextEnhancer 的结果
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { promises as fsp } from 'fs';
import { AIAPIError, type MessageContent, type ModelCallConfig, type ToolCall } from '../aiClient.js';
import { AppPaths } from '../config/appPaths.js';
import { ExecutionStrategyFactory, ExecutionMode } from '../engine/executionStrategy.js';
import type { ExecutionStrategyOptions } from '../engine/executionStrategy.js';
import type { ToolExecutionResult } from '../engine/toolExecutor.js';
import { resetDefaultCircuitBreaker } from '../engine/toolExecutor.js';
import { buildSoulSystemMessage } from '../engine/soulLoader.js';
import { estimateMessagesTokens, truncateContextForModel, sanitizeToolMessages } from '../engine/contextTruncate.js';
import { sanitizeHistoryMessages } from '../engine/historySanitizer.js';
import { resolveImageSanitizationLimits } from '../engine/imageSanitization.js';
import { compressContextWithSummary } from '../engine/contextCompress.js';
import { loadModelsConfig, type ModelsFile, isLocalModel, type ModelConfig } from '../modelsStore.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import {
  getSessions,
  createSession,
  getSessionMessages,
  addMessage,
  updateSession,
} from '../dao/chat.js';
import { matchTriggers, executePluginTrigger } from '../services/pluginAutoInvoke.js';
import { messageQueue, type QueueMode, type QueueEvent } from '../engine/messageQueue.js';
import { logger } from '../logger.js';
import { autoSelectModelAsync, generateMockResponse, isModelAvailable, MODEL_PRESETS } from './modelSelector.js';
import { extractAndAppendMemory, readMemoryMd } from './memoryExtractor.js';
import { getAppSettings } from '../dao/settings.js';
import { extractFileContent } from './chatHelpers/fileExtractor.js';
import { getThinkingCacheKey, getThinkingCache, setThinkingCache } from './chatHelpers/thinkingCache.js';
import { activeSSEConnections } from './chatHelpers/sseHelper.js';
import { sendSSE, sendDebugSSE, sendDoneAndEnd } from '../sse/sseTypes.js';
import { TimerManager } from '../sse/timerManager.js';
import { executeChat as streamExecuteChat, finishStream, type ExecuteChatCallbacks } from '../engine/streamExecutor.js';
import { runChatSession } from '../engine/runChatSession.js';
import { formatMemoryContext } from '../engine/contextEnhancer.js';
import { recordTurnStarted, recordTurnCompleted, recordTurnFailed, recordMessageCreated } from '../engine/eventRecorder.js';
import { TokenBudgetManager } from '../engine/compaction/tokenBudget.js';
import { CompactionLoopGuard, CompactionSafetyTimeout, CompactionRetryAggregateTimeout } from '../engine/compaction/compactionSafety.js';
import { triggerTurnEndSync, triggerPostCompactionSync } from '../engine/sessionMemorySync.js';
import {
  buildApiMessages,
  hasImageAttachment,
} from '../engine/buildApiMessages.js';

/**
 * 错误分类与格式化
 *
 * 将 AI API 错误分类为用户友好的错误消息和错误代码。
 */
export function classifyAndFormatError(
  error: unknown,
  modelConfig?: ModelConfig,
  effectiveModel?: string,
): { code: string; message: string } {
  if (error instanceof AIAPIError) {
    switch (error.category) {
      case 'auth':
        return { code: 'AUTH_FAILED', message: 'API Key 无效或已过期，请在「模型管理」中检查密钥配置。' };
      case 'rate_limit':
        return { code: 'RATE_LIMITED', message: '请求过于频繁，已达到速率限制，请稍后再试。' };
      case 'model_not_supported': {
        // v1.5.208: 402 余额不足等支付类错误会被归类为 model_not_supported 以触发降级
        const body = error.responseBody?.toLowerCase() || '';
        if (body.includes('insufficient balance') || body.includes('billing') || body.includes('payment') || body.includes('quota')) {
          return {
            code: 'INSUFFICIENT_BALANCE',
            message: `当前模型（${effectiveModel}）API 余额不足，已自动尝试切换到备用模型。如果所有模型均余额不足，请充值或配置新的 API Key。`,
          };
        }
        return {
          code: 'MODEL_NOT_SUPPORTED',
          message: `当前模型（${effectiveModel}）暂不可用，已自动尝试切换到备用模型。`,
        };
      }
      case 'network': {
        const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
        if (isLocal) {
          const modelName = modelConfig?.id?.replace('ollama-', '') || '';
          return {
            code: 'MODEL_UNAVAILABLE',
            message: `无法连接到本地 AI 模型服务（${effectiveModel}）。\n\n请检查以下事项：\n1. 确认 Ollama 或其他本地模型服务已启动\n2. 运行 'ollama serve' 启动服务（如使用 Ollama）\n3. 确认模型已下载：ollama pull ${modelName}\n4. 检查端口是否正确（默认 11434）\n\n或者切换到云模型（如 DeepSeek、OpenAI）使用。`,
          };
        }
        return { code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络或 API 端点配置。' };
      }
      case 'timeout':
        return { code: 'TIMEOUT', message: '请求超时，模型响应时间过长，请稍后重试。' };
      case 'server':
        return { code: 'SERVER_ERROR', message: 'AI 服务商暂时不可用，请稍后重试。' };
      default:
        if (error.message === '请求已取消') {
          return { code: 'ABORTED', message: '请求已取消。' };
        }
        return { code: 'UNKNOWN_ERROR', message: `AI 服务暂时不可用：${error.message}` };
    }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'ABORTED', message: '请求已取消。' };
  }

  const errMessage = error instanceof Error ? error.message : '未知错误';
  // 安全网：reactExecutor/toolExecutor 早期版本抛出的取消错误未设 name=AbortError，
  // 此处按 message 兜底识别，避免误显示为"AI 服务暂时不可用"
  if (errMessage === '请求已取消') {
    return { code: 'ABORTED', message: '请求已取消。' };
  }
  if (errMessage.includes('stdout closed') || errMessage.includes('ENOENT') || errMessage.includes('ECONNREFUSED') || errMessage.includes('connect') || errMessage.includes('fetch failed')) {
    const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
    if (isLocal) {
      const modelName = modelConfig?.id?.replace('ollama-', '') || '';
      return {
        code: 'MODEL_UNAVAILABLE',
        message: `无法连接到本地 AI 模型服务（${effectiveModel}）。\n\n请检查以下事项：\n1. 确认 Ollama 或其他本地模型服务已启动\n2. 运行 'ollama serve' 启动服务（如使用 Ollama）\n3. 确认模型已下载：ollama pull ${modelName}\n4. 检查端口是否正确（默认 11434）\n\n或者切换到云模型（如 DeepSeek、OpenAI）使用。`,
      };
    }
    return {
      code: 'MODEL_UNAVAILABLE',
      message: `无法连接到 AI 模型服务（${effectiveModel}）。请确认模型服务已启动。\n提示：如果使用 Ollama，请先运行 'ollama serve' 启动服务。`,
    };
  }

  return { code: 'UNKNOWN_ERROR', message: `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${errMessage}` };
}

// ===================== 降级处理 =====================

/** 降级处理参数 */
interface FallbackParams {
  /** 原始错误 */
  error: unknown;
  /** 原始 API 消息列表（用于降级重试） */
  apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  /** 模型配置文件 */
  modelsConfig: ModelsFile;
  /** 当前模型 ID */
  currentModel: string;
  /** 当前模型配置 */
  modelConfig: ModelConfig | undefined;
  /** Express 响应对象 */
  res: import('express').Response;
  /** Timer 管理器 */
  timerManager: TimerManager;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** 会话 ID */
  sessionId: string;
  /** 技能 ID */
  skillId?: string;
  /** 是否来自队列模式 */
  fromQueue?: boolean;
}

/**
 * 统一降级处理 — 提取公共函数
 *
 * 消除 handleChat 和 executeFromQueue 中的重复降级逻辑。
 * 统一使用 strategy.execute（修复原 handleChat 用 executeToolLoop 的不一致）。
 *
 * @returns true 如果降级成功（done 已发送），false 如果降级失败（调用方需发送错误 done）
 */
async function handleFallback(params: FallbackParams): Promise<boolean> {
  const { error, apiMessages, modelsConfig, currentModel, modelConfig, res, timerManager, signal, executionMode, sessionId, skillId } = params;
  const tag = params.fromQueue ? '[MessageQueue]' : '[Chat API]';

  const isModelUnsupported = error instanceof AIAPIError && error.category === 'model_not_supported';
  const isRecoverable = isModelUnsupported || (
    error instanceof AIAPIError && (
      error.category === 'timeout' ||
      error.category === 'network' ||
      error.category === 'server'
    )
  );

  if (!isRecoverable || !modelConfig) return false;

  // 查找降级模型：优先同 provider 非推理模型，其次任意可用模型
  const fbModel = modelsConfig.models.find((m) =>
    m.enabled && m.id !== currentModel && !m.capabilities?.includes('reasoning') && m.provider === modelConfig.provider && isModelAvailable(m),
  ) || modelsConfig.models.find((m) =>
    m.enabled && m.id !== currentModel && isModelAvailable(m),
  );

  if (!fbModel) return false;

  const reasonLabel = isModelUnsupported ? '模型不支持' : '请求失败';
  logger.debug(`${tag} ${reasonLabel}，降级到 ${fbModel.id}...`);

  // 发送降级通知
  sendSSE(res, {
    type: 'text',
    content: `\n\n> ⚠️ ${reasonLabel}，已自动切换到 **${fbModel.name || fbModel.id}** 重试...\n\n`,
  });

  // 降级期间重启心跳
  timerManager.restart('fallback');

  try {
    const fbKey = selectKey(fbModel);
    const fbApiKey = fbKey ? fbKey.key : (fbModel.apiKey || '');
    const fbModelConfig: ModelCallConfig = {
      id: fbModel.id,
      apiKey: fbApiKey,
      apiEndpoint: fbModel.apiEndpoint || '',
      provider: fbModel.provider,
      temperature: fbModel.temperature ?? 0.7,
      topP: fbModel.topP ?? 1,
      maxTokens: fbModel.maxTokens,
      capabilities: (fbModel.capabilities || []).filter((c: string) => c !== 'reasoning'),
    };

    // 统一使用 strategy.execute（修复原 handleChat 用 executeToolLoop 的不一致）
    const strategy = ExecutionStrategyFactory.create(executionMode);
    // 细粒度 thinking 事件状态（降级路径）
    let fbThinkingStarted = false;
    let fbThinkingStartTime = 0;
    const fbResult: ToolExecutionResult = await strategy.execute({
      modelConfig: fbModelConfig,
      messages: sanitizeToolMessages(apiMessages) as Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
      maxToolTurns: 10,
      signal: signal ?? new AbortController().signal,
      executionMode,
      onSSEEvent: (evt: Record<string, unknown>) => {
        const evtType = evt.type as string;
        if ([
          'init', 'text', 'thinking', 'tool_call', 'done', 'error',
          'image_start', 'image_delta', 'image_end',
          'audio_start', 'audio_delta', 'audio_end',
        ].includes(evtType)) {
          sendSSE(res, evt);
        } else {
          sendDebugSSE(res, evt);
        }
      },
      onChunk: (chunk: string) => {
        sendSSE(res, { type: 'text', content: chunk });
      },
      onThinking: (thinkingChunk: string) => {
        // 细粒度 thinking.start（首个 chunk 一次）
        if (!fbThinkingStarted) {
          fbThinkingStarted = true;
          fbThinkingStartTime = Date.now();
          sendSSE(res, { type: 'thinking.start', contentIndex: 0 });
        }
        // 细粒度 thinking.delta
        sendSSE(res, { type: 'thinking.delta', contentIndex: 0, content: thinkingChunk });
        // 保留原有 thinking 事件（向后兼容）
        sendSSE(res, { type: 'thinking', content: thinkingChunk });
      },
      onToolCall: (toolCall: ToolCall, result: string) => {
        sendSSE(res, {
          type: 'tool_call',
          toolCallId: toolCall.id,
          toolName: toolCall.function?.name || '',
          toolArgs: toolCall.function?.arguments || '',
          toolResult: result,
        });
      },
    });

    // 细粒度 thinking.complete（降级路径收尾）
    if (fbThinkingStarted) {
      sendSSE(res, {
        type: 'thinking.complete',
        contentIndex: 0,
        thinkingDuration: Date.now() - fbThinkingStartTime,
      });
    }

    // 降级成功，清理心跳
    timerManager.stop('fallback');

    // 保存降级模型回复到 DB
    if (fbResult.content) {
      addMessage({
        sessionId,
        role: 'assistant',
        content: fbResult.content,
        model: fbModel.id,
        skillId: skillId || null,
        toolCalls: fbResult.toolCalls?.length > 0 ? JSON.stringify(fbResult.toolCalls) : undefined,
      });
    }

    if (fbKey && fbKey.index >= 0) {
      reportKeyResult(fbModel.id, fbKey.index, true);
    }

    // 发送 done 事件
    await finishStream(res, timerManager, {
      fallbackModel: fbModel.id,
      fallbackReason: isModelUnsupported ? 'model_not_supported' : 'request_failed',
    });

    return true;
  } catch (fbErr) {
    // 降级失败，清理心跳
    timerManager.stop('fallback');
    logger.warn(`${tag} 降级模型 ${fbModel.id} 也失败:`, fbErr instanceof Error ? fbErr.message : String(fbErr));
    return false;
  }
}

// ===================== 队列执行 =====================

/** 队列执行参数 */
interface QueueExecuteParams {
  model: string;
  modelName: string;
  assistantId: string;
  preset: typeof MODEL_PRESETS[string] | null;
  executionMode?: string;
  conversationHistory?: any[];
  skillContext?: string;
  skillId?: string;
  attachments?: any[];
  autoReason?: string;
  autoReasonType?: string;
  message: string;
  modelsConfig: ModelsFile;
  toolProfile?: string;
  compaction?: any;
}

/**
 * 队列消息执行 — 替代原 executeFromQueue
 *
 * 统一调用 streamExecutor.executeChat()，消除重复代码。
 * 队列模式通过 fromQueue=true 标记，影响日志和 Phase 2 行为。
 */
async function executeQueuedMessage(
  sessionId: string,
  event: QueueEvent,
  res: import('express').Response,
  params: QueueExecuteParams,
): Promise<void> {
  logger.debug(`[MessageQueue] 执行出队消息: sessionId=${sessionId}, mode=${event.mode}, messageId=${event.messageId}`);

  const timerManager = new TimerManager(res);

  let apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string; reasoning_content?: string }> = [];

  try {
    // v9.0: 生成 runId 用于事件追踪
    const runId = `run-${Date.now()}`;

    const modelConfig = params.modelsConfig.models.find((m) => m.id === params.model);
    if (!modelConfig) {
      throw new Error(`未找到模型配置: ${params.model}`);
    }

    const keyResult = selectKey(modelConfig);
    let effectiveApiKey = modelConfig.apiKey || '';
    if (keyResult) {
      effectiveApiKey = keyResult.key;
    }

    const finalModelConfig: ModelCallConfig = {
      ...modelConfig,
      apiKey: effectiveApiKey,
      temperature: params.preset ? params.preset.temperature : modelConfig.temperature,
      topP: params.preset ? params.preset.topP : modelConfig.topP,
    };

    // 构建 API 消息（统一调用 buildApiMessages 公共函数）
    const dbMessages = getSessionMessages(sessionId);
    const built = await buildApiMessages({
      sessionId,
      message: params.message,
      modelConfig,
      finalModelConfig,
      dbMessages,
      conversationHistory: params.conversationHistory,
      skillContext: params.skillContext,
      attachments: params.attachments,
      hasImage: hasImageAttachment(params.attachments),
    });
    apiMessages = built.apiMessages;

    const abortController = messageQueue.getCurrentAbortController(sessionId);
    if (!abortController) {
      throw new Error('未找到会话级 AbortController');
    }

    // 确定执行模式
    let effectiveMode = (params.executionMode && Object.values(ExecutionMode).includes(params.executionMode as ExecutionMode))
      ? (params.executionMode as ExecutionMode)
      : undefined;
    if (!effectiveMode) {
      try {
        const settingsVal = getAppSettings('default');
        if (settingsVal) {
          const parsed = JSON.parse(settingsVal);
          const defaultMode = parsed?.aiEngine?.defaultExecutionMode;
          if (defaultMode && Object.values(ExecutionMode).includes(defaultMode as ExecutionMode)) {
            effectiveMode = defaultMode as ExecutionMode;
          }
        }
      } catch { /* ignore */ }
    }
    if (!effectiveMode) {
      effectiveMode = ExecutionStrategyFactory.getDefaultMode();
    }

    // v9.1 [七]: 自动调度闭环 — AUTO 模式由复杂度评估推导实际策略
    if (effectiveMode === ExecutionMode.AUTO) {
      const resolved = ExecutionStrategyFactory.resolveAutoMode(apiMessages, params.message);
      logger.info(`[ChatService] 自动调度: AUTO → ${resolved} (会话 ${sessionId})`);
      if (res) {
        sendDebugSSE(res, {
          type: 'strategy_selected',
          requested: 'auto',
          resolved,
          reason: '复杂度评估自动推导',
        });
      }
      effectiveMode = resolved;
    }

    const callbacks: ExecuteChatCallbacks = {
      onRateLimit: async () => {
        const nextKey = selectKey(modelConfig);
        if (nextKey) {
          logger.debug(`[MessageQueue] 429 速率限制，切换到备用 Key #${nextKey.index}`);
          return { apiKey: nextKey.key, keyIndex: nextKey.index };
        }
        return null;
      },
    };

    // v9.0: 记录回合开始事件
    await recordTurnStarted(sessionId, {
      userMessage: params.message,
      model: params.model,
      executionMode: effectiveMode,
      runId,
    });

    // 调用统一执行器
    const ctxWindow = (finalModelConfig as ModelCallConfig).contextWindow || 128000;
    const ctxMaxTokens = Math.min((finalModelConfig as ModelCallConfig).maxTokens || 8192, 8192);
    const result = await streamExecuteChat({
      sessionId,
      message: params.message,
      model: params.model,
      modelName: params.modelName,
      modelConfig: finalModelConfig,
      apiMessages,
      res,
      executionMode: effectiveMode,
      timerManager,
      signal: abortController.signal,
      modelCapabilities: modelConfig.capabilities || [],
      ctxWindow,
      ctxMaxTokens,
      estimatedToolsCount: 30,
      fromQueue: true,
      callbacks,
      toolProfile: params.toolProfile as any,
      compaction: params.compaction,
    });

    // 保存助手消息到 DB
    addMessage({
      sessionId,
      role: 'assistant',
      content: result.content,
      model: params.model,
      toolCalls: result.toolCalls?.length ? JSON.stringify(result.toolCalls) : undefined,
      thinking: result.thinkingContent || undefined,
      thinkingDuration: result.thinkingDuration || undefined,
    });

    // v9.0: 记录回合完成事件
    await recordTurnCompleted(sessionId, {
      assistantContent: result.content,
      model: params.model,
      toolCallsCount: result.toolCalls?.length,
      thinkingDuration: result.thinkingDuration,
      usage: result.usage,
      runId,
    });

    // 后台提取记忆
    extractAndAppendMemory(params.message, result.content, dbMessages.map((m) => ({ role: m.role, content: m.content }))).catch(() => {});

    // 发送 done 事件
    await finishStream(res, timerManager, {
      thinkingDuration: result.thinkingDuration,
      usage: result.usage,
    });

    messageQueue.markCompleted(sessionId);
    activeSSEConnections.delete(sessionId);

  } catch (error) {
    logger.error('[MessageQueue executeQueuedMessage] 执行失败:', error);

    // v9.0: 记录回合失败事件
    await recordTurnFailed(sessionId, error instanceof Error ? error : String(error), {
      model: params.model,
      context: 'executeQueuedMessage',
    });

    // 尝试降级
    const modelConfig = params.modelsConfig.models.find((m) => m.id === params.model);
    const fallbackSuccess = await handleFallback({
      error,
      apiMessages,
      modelsConfig: params.modelsConfig,
      currentModel: params.model,
      modelConfig,
      res,
      timerManager,
      signal: messageQueue.getCurrentAbortController(sessionId)?.signal,
      executionMode: (params.executionMode as ExecutionMode) || ExecutionMode.REACT,
      sessionId,
      skillId: params.skillId,
      fromQueue: true,
    });

    if (!fallbackSuccess) {
      // 降级失败，发送错误 done
      const { code, message: errMsg } = classifyAndFormatError(error, modelConfig, params.model);
      sendSSE(res, { type: 'text', content: errMsg });
      await finishStream(res, timerManager, {
        errorCode: code === 'UNKNOWN_ERROR' ? 'QUEUE_EXEC_ERROR' : code,
        errorMessage: errMsg,
      });
    }

    messageQueue.markCompleted(sessionId);
    activeSSEConnections.delete(sessionId);
  }
}

// ===================== 主聊天处理器 =====================

/**
 * 主聊天处理器 — 薄封装
 *
 * 解析请求 → 构建 apiMessages → 调用 streamExecutor.executeChat()
 * 队列模式也走统一路径，通过回调区分。
 */
export async function handleChat(req: import('express').Request, res: import('express').Response): Promise<void> {
  const {
    sessionId: reqSessionId,
    message,
    model = 'auto',
    skillContext,
    skillId,
    preset,
    conversationHistory,
    attachments,
    executionMode,
    queueMode,
    agentId,
    toolProfile,
    compaction,
  } = req.body;

  const sessionId = reqSessionId || uuidv4();
  logger.debug(`[Chat API] 收到请求: sessionId=${sessionId}, model=${model}, agentId=${agentId || 'none'}, message="${message?.slice(0, 30)}", queueMode=${queueMode || 'default'}`);
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    logger.debug(`[Chat API] 附件数量: ${attachments.length}`);
  }

  // v6.1: 每次新请求重置默认熔断器，避免搜索工具因之前会话的失败被永久熔断
  resetDefaultCircuitBreaker();

  const timerManager = new TimerManager(res);

  const apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string; reasoning_content?: string }> = [];
  const abortController: AbortController = new AbortController();
  const selectedKeyIndex = -1;

  try {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    if (req.socket) {
      req.socket.setNoDelay(true);
    }

    // 加载模型配置
    const modelsConfig = await loadModelsConfig();
    let effectiveModel: string;
    let effectiveModelName: string;
    let autoReason: string | undefined;
    let autoReasonType: string | undefined;
    let autoSemanticMethod: string | undefined;
    let autoSemanticConfidence: number | undefined;

    if (model === 'auto') {
      const hasImg = hasImageAttachment(attachments);
      try {
        const autoResult = await autoSelectModelAsync(message, modelsConfig, hasImg);
        effectiveModel = autoResult.modelId;
        effectiveModelName = autoResult.modelName;
        autoReason = `${autoResult.modelName} · ${autoResult.reason}`;
        autoReasonType = autoResult.reasonType;
        autoSemanticMethod = autoResult.semanticIntent?.method;
        autoSemanticConfidence = autoResult.semanticIntent?.confidence;
        logger.debug(`[Auto Model] ${autoResult.reasonType} → ${autoResult.modelName} (${autoResult.modelId})`);
      } catch (autoErr: any) {
        const errMsg = autoErr instanceof Error ? autoErr.message : '无可用模型';
        const errCode = autoErr.code || 'NO_AVAILABLE_MODELS';
        sendSSE(res, { type: 'error', code: errCode, message: errMsg });
        await sendDoneAndEnd(res, { errorCode: errCode, errorMessage: errMsg, thinkingDuration: 0 });
        return;
      }
    } else {
      effectiveModel = model;
      const found = modelsConfig.models.find((m) => m.id === model);
      effectiveModelName = found?.name || model;
    }

    const activePreset = preset && MODEL_PRESETS[preset] ? MODEL_PRESETS[preset] : null;

    // 创建会话（如果不存在）
    const sessions = getSessions();
    const sessionExists = sessions.some((s) => s.id === sessionId);
    if (!sessionExists) {
      createSession(sessionId, '新对话', effectiveModel, agentId);
    }

    // v1.7.18: 先从 DB 读取历史消息（保存当前用户消息之前），作为上下文的权威来源
    const dbMessages = getSessionMessages(sessionId);

    // 保存用户消息
    addMessage({ sessionId, role: 'user', content: message, model: effectiveModel, skillId: skillId || null, attachments: attachments || undefined });

    // 首条用户消息自动生成标题
    if (dbMessages.length === 0) {
      const autoTitle = message.slice(0, 30).replace(/\n/g, ' ').trim() || '新对话';
      updateSession(sessionId, { title: autoTitle });
    }

    // v9.0: 记录用户消息创建事件
    const userMessageId = uuidv4();
    await recordMessageCreated(sessionId, userMessageId, 'user', message, {
      model: effectiveModel,
      attachments,
    });

    // 发送 init 事件
    const assistantId = uuidv4();
    sendSSE(res, {
      type: 'init',
      sessionId,
      assistantMessageId: assistantId,
      model: effectiveModel,
      modelName: effectiveModelName,
      autoReason,
      autoReasonType,
      autoSemanticMethod,
      autoSemanticConfidence,
      preset: activePreset ? { id: preset, label: activePreset.label } : null,
    });

    // ============== 队列模式 ==============
    const effectiveQueueMode = queueMode as QueueMode | undefined;
    if (effectiveQueueMode) {
      activeSSEConnections.set(sessionId, { res, assistantMessageId: assistantId, createdAt: Date.now(), lastActivityAt: Date.now() });

      const result = messageQueue.enqueue(sessionId, message, effectiveQueueMode, {
        model: effectiveModel,
        modelName: effectiveModelName,
        skillContext,
        skillId,
        preset,
        attachments,
        executionMode,
        conversationHistory,
        autoReason,
        autoReasonType,
        autoSemanticMethod,
        autoSemanticConfidence,
      });

      if (!result.accepted) {
        // 队列拒绝 — 合并到 debug 通道
        sendDebugSSE(res, { type: 'queue_rejected', reason: result.reason });
        await sendDoneAndEnd(res, { errorCode: 'QUEUE_REJECTED', errorMessage: result.reason, thinkingDuration: 0 });
        activeSSEConnections.delete(sessionId);
        return;
      }

      // 队列状态 — 合并到 debug 通道
      sendDebugSSE(res, {
        type: 'queue_status',
        mode: effectiveQueueMode,
        state: messageQueue.getSessionState(sessionId),
        queueLength: messageQueue.getQueueLength(sessionId),
        assistantMessageId: result.assistantMessageId,
      });

      const executeHandler = (event: QueueEvent) => {
        if (event.sessionId !== sessionId) return;
        if (event.type === 'executing' && event.messageId === result.messageId) {
          messageQueue.off('queue', executeHandler);
          executeQueuedMessage(sessionId, event, res, {
            model: effectiveModel,
            modelName: effectiveModelName,
            assistantId: result.assistantMessageId,
            preset: activePreset,
            executionMode,
            conversationHistory,
            skillContext,
            skillId,
            attachments,
            autoReason,
            autoReasonType,
            message,
            modelsConfig,
          });
        }
      };

      messageQueue.on('queue', executeHandler);

      // 如果已经在执行中，直接触发
      const currentState = messageQueue.getSessionState(sessionId);
      if (currentState === 'executing' && messageQueue.getCurrentAssistantId(sessionId) === result.assistantMessageId) {
        messageQueue.off('queue', executeHandler);
        executeQueuedMessage(sessionId, {
          type: 'executing',
          sessionId,
          messageId: result.messageId,
          assistantMessageId: result.assistantMessageId,
          mode: effectiveQueueMode,
          queueLength: 0,
          state: 'executing',
        }, res, {
          model: effectiveModel,
          modelName: effectiveModelName,
          assistantId: result.assistantMessageId,
          preset: activePreset,
          executionMode,
          conversationHistory,
          skillContext,
          skillId,
          attachments,
          autoReason,
          autoReasonType,
          message,
          modelsConfig,
        });
      }

      return;
    }

    // ============== 直接模式 — 调用 runChatSession ==============
    await runChatSession(
      {
        sessionId,
        message,
        model,
        skillContext,
        skillId,
        preset,
        conversationHistory,
        attachments,
        executionMode,
        agentId,
        toolProfile,
        compaction,
      },
      {
        onEvent: (event) => {
          sendSSE(res, event);
        },
        onChunk: (text) => {
          sendSSE(res, { type: 'text', content: text });
        },
        onThinking: (text) => {
          sendSSE(res, { type: 'thinking', content: text });
        },
        onToolCall: (tc) => {
          sendSSE(res, {
            type: 'tool_call',
            toolCallId: tc.id,
            toolName: tc.name,
            toolArgs: tc.args,
            toolResult: tc.result,
          });
        },
        onDone: (result) => {
          finishStream(res, timerManager, {
            thinkingDuration: result.thinkingDuration,
            usage: result.usage,
            fallbackModel: result.fallbackModel,
            fallbackReason: result.fallbackReason,
          }).catch(() => {});
        },
        onError: (err) => {
          logger.error('[handleChat] runChatSession error:', err);
        },
      },
    );

    // 处理客户端断开
    req.on('close', () => {
      timerManager.stopAll();
    });

  } catch (error) {
    logger.error('[Chat API] 错误:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      const { code, message: errMsg } = classifyAndFormatError(error, undefined, undefined);
      sendSSE(res, { type: 'text', content: errMsg });
      await finishStream(res, timerManager, {
        errorCode: code,
        errorMessage: errMsg,
      }).catch(() => {});
    }
  }
}

export { activeSSEConnections } from './chatHelpers/sseHelper.js';
