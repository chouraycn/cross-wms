/**
 * runChatSession — 统一的聊天会话执行核心
 *
 * 架构定位：
 * - 这是 cdf-know 聊天功能的执行入口，解耦 Express HTTP 层
 * - 后端路由（/api/agent-chat）、gateway、ACP 引擎都通过本模块执行聊天
 * - 直接调用 buildApiMessages + streamExecutor.executeChat（纯回调驱动，无 res 依赖）
 *
 * 完整功能：
 * 1. 模型自动选择 + Key 轮换
 * 2. 模拟模式（无 API Key 时）
 * 3. Thinking 缓存
 * 4. 插件自动触发（onThinking 回调中匹配）
 * 5. 超时管理（本地 300s / 云 120s）
 * 6. 模型降级 / fallback
 * 7. Token 预算管理 + 响应后压缩（三重安全防护）
 * 8. 记忆提取 + 会话记忆同步
 * 9. 事件记录（message.created / turn.started / turn.completed / turn.failed）
 * 10. 熔断器重置
 */

import { v4 as uuidv4 } from 'uuid';
import { executeChat as streamExecuteChat } from './streamExecutor.js';
import type { ExecuteChatCallbacks, ExecuteChatResult } from './streamExecutor.js';
import { buildApiMessages, hasImageAttachment } from './buildApiMessages.js';
import type { ModelCallConfig } from '../aiClient.js';
import { loadModelsConfig, isLocalModel } from '../modelsStore.js';
import type { ModelConfig, ModelsFile } from '../modelsStore.js';
import { autoSelectModel, generateMockResponse } from '../routes/modelSelector.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import { TimerManager } from '../sse/timerManager.js';
import { ExecutionMode } from './executionStrategy.js';
import { getSessionMessages, addMessage, getSessions, createSession, updateSession } from '../dao/chat.js';
import { extractAndAppendMemory } from '../routes/memoryExtractor.js';
import { triggerTurnEndSync, triggerPostCompactionSync } from './sessionMemorySync.js';
import { compressContextWithSummary } from './contextCompress.js';
import { TokenBudgetManager } from './compaction/tokenBudget.js';
import { CompactionLoopGuard, CompactionSafetyTimeout, CompactionRetryAggregateTimeout } from './compaction/compactionSafety.js';
import { getThinkingCacheKey, getThinkingCache, setThinkingCache } from '../routes/chatHelpers/thinkingCache.js';
import { matchTriggers, executePluginTrigger } from '../services/pluginAutoInvoke.js';
import { resetDefaultCircuitBreaker } from './toolExecutor.js';
import { recordMessageCreated, recordTurnStarted, recordTurnCompleted, recordTurnFailed } from './eventRecorder.js';
import { classifyAndFormatError } from '../routes/chatService.js';
import { logger } from '../logger.js';
import { runHooks, createHookEvent } from './hooks/index.js';
import { getKeywordTriggerEngine } from './keywordTriggerEngine.js';

// ===================== 类型定义 =====================

export interface RunChatSessionInput {
  sessionId: string;
  message: string;
  model?: string;
  skillContext?: string;
  skillId?: string;
  preset?: string;
  conversationHistory?: unknown[];
  attachments?: unknown[];
  executionMode?: string;
  agentId?: string;
  toolProfile?: string;
  compaction?: unknown;
  referencedSessionIds?: string[];
  userId?: string;
  /** 思考级别（off/low/medium/high 等），控制模型推理深度 */
  thinkingLevel?: string;
}

export interface RunChatSessionCallbacks {
  /** SSE 事件回调（每个 data: 行触发一次） */
  onEvent?: (event: { type: string; [key: string]: unknown }) => void;
  /** 文本块回调 */
  onChunk?: (text: string) => void;
  /** 思考块回调 */
  onThinking?: (text: string) => void;
  /** 工具调用回调 */
  onToolCall?: (toolCall: { id: string; name: string; args: string; result: string }) => void;
  /** 流结束回调 */
  onDone?: (result: RunChatSessionResult) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

export interface RunChatSessionResult {
  content: string;
  thinkingContent?: string;
  thinkingDuration?: number;
  thinkingSignature?: string;
  redacted?: boolean;
  toolCallsJson?: string;
  usage?: unknown;
  errorCode?: string;
  errorMessage?: string;
  fallbackModel?: string;
  fallbackReason?: string;
  assistantMessageId?: string;
  model?: string;
  modelName?: string;
}

// ===================== 核心函数 =====================

/**
 * 执行一次聊天会话
 *
 * @param input 会话输入参数
 * @param callbacks 事件回调
 * @returns 执行结果
 *
 * @example
 * ```ts
 * const result = await runChatSession(
 *   { sessionId: 'sess_123', message: '你好', model: 'auto' },
 *   { onEvent: (evt) => console.log(evt) }
 * );
 * console.log(result.content);
 * ```
 */
export async function runChatSession(
  input: RunChatSessionInput,
  callbacks: RunChatSessionCallbacks = {},
): Promise<RunChatSessionResult> {
  const sessionId = input.sessionId;
  const message = input.message;
  const model = input.model || 'auto';
  const executionMode = input.executionMode === 'agent'
    ? ExecutionMode.AGENT
    : input.executionMode === 'legacy'
    ? ExecutionMode.LEGACY
    : ExecutionMode.REACT;

  const assistantMessageId = uuidv4();

  // 熔断器重置（避免上次失败永久熔断）
  resetDefaultCircuitBreaker();

  // 会话管理：不存在则创建
  const existingSessions = getSessions();
  const sessionExists = existingSessions.some((s: { id: string }) => s.id === sessionId);
  if (!sessionExists) {
    const title = message.slice(0, 30) || '新会话';
    createSession(sessionId, title, model, input.agentId, null, null, []);
    runHooks(createHookEvent('session', 'start', sessionId, { agentId: input.agentId })).catch(() => {});
  }

  // 记录用户消息创建事件
  recordMessageCreated(sessionId, assistantMessageId, 'user', message, {
    model,
    attachments: input.attachments,
  }).catch(() => {});
  recordTurnStarted(sessionId, { userMessage: message, model, executionMode: input.executionMode }).catch(() => {});
  runHooks(createHookEvent('message', 'received', sessionId, { role: 'user', content: message })).catch(() => {});

  // ===== 关键词自动触发检查 =====
  const keywordEngine = getKeywordTriggerEngine();
  const keywordMatches = keywordEngine.matchMessage(message, {
    sessionId,
    userId: input.userId,
    agentId: input.agentId,
    message,
  });
  if (keywordMatches.length > 0) {
    for (const match of keywordMatches) {
      callbacks.onEvent?.({
        type: 'keyword_trigger',
        skillId: match.skillId,
        skillName: match.skillName,
        matchedKeywords: match.matchedKeywords,
        matchScore: match.matchScore,
        reason: match.reason,
      });
      logger.info(`[KeywordTrigger] Matched skill "${match.skillName}" for message: "${message.substring(0, 50)}..."`);
    }
  }

  const modelsConfig = await loadModelsConfig();

  let effectiveModel: string;
  let effectiveModelName: string;
  let autoReason: string | undefined;
  let autoReasonType: string | undefined;

  if (model === 'auto') {
    const autoResult = autoSelectModel(message, modelsConfig as ModelsFile, hasImageAttachment(input.attachments));
    effectiveModel = autoResult.modelId;
    effectiveModelName = autoResult.modelName;
    autoReason = `${autoResult.modelName} · ${autoResult.reason}`;
    autoReasonType = autoResult.reasonType;
  } else {
    effectiveModel = model;
    const found = modelsConfig.models.find((m) => m.id === model);
    effectiveModelName = found?.name || model;
  }

  const modelConfig = modelsConfig.models.find((m) => m.id === effectiveModel);
  if (!modelConfig) {
    const err = new Error(`未找到模型配置: ${effectiveModel}`);
    callbacks.onError?.(err);
    throw err;
  }

  const keyResult = selectKey(modelConfig as ModelConfig);
  const effectiveApiKey = keyResult ? keyResult.key : ((modelConfig as ModelConfig).apiKey || '');
  const selectedKeyIndex = keyResult ? keyResult.index : -1;

  const finalModelConfig: ModelCallConfig = {
    ...(modelConfig as ModelConfig),
    apiKey: effectiveApiKey,
    temperature: (modelConfig as ModelConfig).temperature,
    topP: (modelConfig as ModelConfig).topP,
    thinkingLevel: input.thinkingLevel || (modelConfig as ModelConfig).defaultThinkingLevel,
  };

  const dbMessages = getSessionMessages(sessionId);
  const built = await buildApiMessages({
    sessionId,
    message,
    modelConfig: modelConfig as ModelConfig,
    finalModelConfig,
    dbMessages,
    conversationHistory: input.conversationHistory,
    skillContext: input.skillContext,
    attachments: input.attachments,
    referencedSessionIds: input.referencedSessionIds,
    hasImage: hasImageAttachment(input.attachments),
  });

  const timerManager = new TimerManager();
  const abortController = new AbortController();

  // 超时设置：本地模型 300s，云模型 120s
  const timeoutMs = isLocalModel(modelConfig as ModelConfig) ? 300_000 : 120_000;
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  callbacks.onEvent?.({
    type: 'init',
    sessionId,
    assistantMessageId,
    model: effectiveModel,
    modelName: effectiveModelName,
    autoReason,
    autoReasonType,
    preset: input.preset || null,
  });

  // ===== 模拟模式（无 API Key 且非本地模型）=====
  const isLocal = isLocalModel(modelConfig as ModelConfig);
  if (!effectiveApiKey && !isLocal) {
    const mockContent = generateMockResponse(message);
    // 分段流式发送模拟响应
    const chunkSize = 5;
    for (let i = 0; i < mockContent.length; i += chunkSize) {
      const chunk = mockContent.slice(i, i + chunkSize);
      callbacks.onChunk?.(chunk);
      callbacks.onEvent?.({ type: 'text', content: chunk });
      await new Promise((r) => setTimeout(r, 15));
    }
    addMessage({
      sessionId,
      role: 'assistant',
      content: mockContent,
      model: effectiveModel,
      skillId: input.skillId || null,
      toolCalls: undefined,
      thinking: null,
      thinkingDuration: null,
    });
    runHooks(createHookEvent('message', 'sent', sessionId, { role: 'assistant', content: mockContent })).catch(() => {});
    callbacks.onEvent?.({ type: 'done', errorCode: null, errorMessage: null });
    clearTimeout(timeoutHandle);
    const mockResult: RunChatSessionResult = {
      content: mockContent,
      assistantMessageId,
      model: effectiveModel,
      modelName: effectiveModelName,
    };
    callbacks.onDone?.(mockResult);
    return mockResult;
  }

  // ===== Thinking 缓存检查 =====
  const thinkingCacheKey = getThinkingCacheKey(effectiveModel, message);
  const cached = getThinkingCache(thinkingCacheKey);
  if (cached) {
    // 缓存命中：整块输出 thinking + content
    callbacks.onEvent?.({ type: 'thinking', content: cached.thinking });
    callbacks.onChunk?.(cached.content);
    callbacks.onEvent?.({ type: 'text', content: cached.content });

    addMessage({
      sessionId,
      role: 'assistant',
      content: cached.content,
      model: effectiveModel,
      skillId: input.skillId || null,
      toolCalls: undefined,
      thinking: cached.thinking,
      thinkingDuration: 0,
    });

    runHooks(createHookEvent('message', 'sent', sessionId, { role: 'assistant', content: cached.content })).catch(() => {});

    callbacks.onEvent?.({ type: 'done', errorCode: null, errorMessage: null });
    const cachedResult: RunChatSessionResult = {
      content: cached.content,
      thinkingContent: cached.thinking,
      assistantMessageId,
      model: effectiveModel,
      modelName: effectiveModelName,
    };
    callbacks.onDone?.(cachedResult);
    clearTimeout(timeoutHandle);
    return cachedResult;
  }

  // ===== 插件自动触发状态 =====
  let thinkingChunkCount = 0;
  let accumulatedThinking = '';

  // ===== Token 预算管理 + 压缩安全防护 =====
  const ctxWindow = finalModelConfig.contextWindow || 128000;
  const ctxMaxTokens = Math.min(finalModelConfig.maxTokens || 8192, 8192);
  const tokenBudget = new TokenBudgetManager({ modelLimit: ctxWindow });
  const compactionLoopGuard = new CompactionLoopGuard();
  const compactionRetryBudget = new CompactionRetryAggregateTimeout();

  const executeCallbacks: ExecuteChatCallbacks = {
    onChunk: (chunk: string) => {
      callbacks.onChunk?.(chunk);
      callbacks.onEvent?.({ type: 'text', content: chunk });
    },
    onThinking: (thinkingChunk: string) => {
      callbacks.onThinking?.(thinkingChunk);
      callbacks.onEvent?.({ type: 'thinking', content: thinkingChunk });
      accumulatedThinking += thinkingChunk;
      thinkingChunkCount++;
      // 每 5 个 chunk 检查插件触发
      if (thinkingChunkCount % 5 === 0) {
        matchTriggers(accumulatedThinking, sessionId).then(async (matches) => {
          for (const match of matches) {
            callbacks.onEvent?.({
              type: 'debug',
              debugType: 'client_tool',
              toolName: match.toolName,
              args: match.args,
            });
            try {
              const { output, durationMs } = await executePluginTrigger(match);
              callbacks.onEvent?.({
                type: 'debug',
                debugType: 'plugin_result',
                toolName: match.toolName,
                output,
                durationMs,
              });
            } catch { /* ignore */ }
          }
        }).catch(() => {});
      }
    },
    onToolCall: (toolCall, result) => {
      callbacks.onToolCall?.({
        id: toolCall.id,
        name: toolCall.function.name,
        args: toolCall.function.arguments,
        result,
      });
      callbacks.onEvent?.({
        type: 'tool_call',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        toolArgs: toolCall.function.arguments,
        toolResult: result,
      });
    },
    onSSEEvent: (event: Record<string, unknown>) => {
      callbacks.onEvent?.(event as { type: string; [key: string]: unknown });
    },
    onRateLimit: async () => {
      const result = selectKey(modelConfig as ModelConfig);
      if (result) {
        reportKeyResult(result.key, result.index, true);
        return { apiKey: result.key, keyIndex: result.index };
      }
      return null;
    },
  };

  try {
    const result: ExecuteChatResult = await streamExecuteChat({
      sessionId,
      message,
      model: effectiveModel,
      modelName: effectiveModelName,
      modelConfig: finalModelConfig,
      apiMessages: built.apiMessages,
      executionMode,
      timerManager,
      signal: abortController.signal,
      modelCapabilities: (modelConfig as ModelConfig).capabilities,
      ctxWindow,
      ctxMaxTokens,
      estimatedToolsCount: 30,
      callbacks: executeCallbacks,
      toolProfile: input.toolProfile as any,
      compaction: input.compaction as any,
    });

    clearTimeout(timeoutHandle);
    timerManager.stopAll();

    const toolCallsJson = result.toolCalls && result.toolCalls.length > 0
      ? JSON.stringify(result.toolCalls)
      : undefined;

    // 从工具调用结果中提取生成的文件信息
    const generatedFiles = result.toolCalls
      ?.filter(tc => tc.name === 'file_generateFile')
      .map(tc => {
        try {
          const resultData = JSON.parse(tc.result);
          if (resultData.success) {
            return {
              fileName: resultData.fileName,
              filePath: resultData.filePath,
              fileSize: resultData.fileSize,
              sessionId,
              description: resultData.description || '',
              downloadUrl: resultData.downloadUrl,
              previewUrl: resultData.previewUrl,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) || [];

    // Thinking 缓存写入
    if (result.thinkingContent && result.content) {
      setThinkingCache(thinkingCacheKey, result.content, result.thinkingContent);
    }

    // Token 预算管理 + 响应后压缩（三重安全防护）
    if (result.usage) {
      tokenBudget.updateUsage(result.usage as any);
    }
    if (tokenBudget.shouldCompact() && compactionLoopGuard.canCompact(0) && compactionRetryBudget.canRetry()) {
      try {
        const safetyTimeout = new CompactionSafetyTimeout(60_000);
        const compactionSignal = safetyTimeout.start();
        const tokensBefore = (result.usage as any)?.totalTokens || 0;

        const compactionResult = await Promise.race([
          compressContextWithSummary(
            built.apiMessages,
            ctxWindow,
            ctxMaxTokens,
            30,
            finalModelConfig,
            undefined,
            undefined,
            undefined,
          ),
          new Promise<never>((_, reject) => {
            compactionSignal.addEventListener('abort', () => reject(new Error('compaction timeout')));
          }),
        ]);

        const tokensAfter = compactionResult.compressed ? Math.floor(tokensBefore * 0.5) : tokensBefore;
        compactionLoopGuard.record(tokensBefore, tokensAfter);
        compactionRetryBudget.recordAttempt(safetyTimeout.getElapsedMs());

        if (compactionResult.compressed) {
          callbacks.onEvent?.({
            type: 'compaction',
            tokensBefore,
            tokensAfter,
            reductionRatio: tokensBefore > 0 ? (tokensBefore - tokensAfter) / tokensBefore : 0,
          });
          triggerPostCompactionSync(sessionId, input.agentId || 'default').catch(() => {});
        }
      } catch (compactionErr) {
        logger.warn('[runChatSession] 响应后压缩失败:', compactionErr);
      }
    }

    const finalResult: RunChatSessionResult = {
      content: result.content,
      thinkingContent: result.thinkingContent,
      thinkingDuration: result.thinkingDuration,
      thinkingSignature: result.thinkingSignature,
      redacted: result.redacted,
      toolCallsJson,
      usage: result.usage,
      fallbackModel: result.fallbackModel,
      fallbackReason: result.fallbackReason,
      assistantMessageId,
      model: effectiveModel,
      modelName: effectiveModelName,
    };

    addMessage({
      sessionId,
      role: 'assistant',
      content: result.content,
      model: effectiveModel,
      skillId: input.skillId || null,
      toolCalls: toolCallsJson,
      thinking: result.thinkingContent || null,
      thinkingDuration: result.thinkingDuration || null,
      generatedFiles: generatedFiles.length > 0 ? JSON.stringify(generatedFiles) : undefined,
    });

    runHooks(createHookEvent('message', 'sent', sessionId, { role: 'assistant', content: result.content })).catch(() => {});

    // v10.0: 保存思考级别到会话，供下次切换会话时恢复
    if (input.thinkingLevel) {
      updateSession(sessionId, { thinkingLevel: input.thinkingLevel });
    }

    if (selectedKeyIndex >= 0 && effectiveModel) {
      reportKeyResult(effectiveModel, selectedKeyIndex, true);
    }

    // 后台记忆处理
    extractAndAppendMemory(
      message,
      result.content,
      built.apiMessages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    ).catch(() => {});

    triggerTurnEndSync(sessionId).catch(() => {});

    // 事件记录
    recordTurnCompleted(sessionId, {
      assistantContent: result.content,
      model: effectiveModel,
      toolCallsCount: result.toolCalls?.length || 0,
      thinkingDuration: result.thinkingDuration,
      usage: result.usage as any,
    }).catch(() => {});

    callbacks.onEvent?.({
      type: 'done',
      errorCode: null,
      errorMessage: null,
      thinkingDuration: result.thinkingDuration,
      usage: result.usage,
      fallbackModel: result.fallbackModel,
      fallbackReason: result.fallbackReason,
    });

    callbacks.onDone?.(finalResult);
    return finalResult;

  } catch (error) {
    clearTimeout(timeoutHandle);
    timerManager.stopAll();

    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[runChatSession] 执行失败:', err);

    // ===== 模型降级 / fallback =====
    const fallbackResult = await tryFallback(
      err,
      built.apiMessages,
      modelsConfig as ModelsFile,
      effectiveModel,
      modelConfig as ModelConfig,
      executionMode,
      sessionId,
      input.skillId,
      input.toolProfile,
      input.compaction,
      callbacks,
      timerManager,
      abortController.signal,
    );

    if (fallbackResult) {
      // 降级成功
      if (selectedKeyIndex >= 0 && effectiveModel) {
        reportKeyResult(effectiveModel, selectedKeyIndex, false);
      }
      return fallbackResult;
    }

    // 降级失败 → 错误分类
    const { code: errorCode, message: errorMessage } = classifyAndFormatError(err, modelConfig as ModelConfig, effectiveModel);

    if (selectedKeyIndex >= 0 && effectiveModel) {
      reportKeyResult(effectiveModel, selectedKeyIndex, false);
    }

    const errorResult: RunChatSessionResult = {
      content: '',
      errorCode,
      errorMessage,
      assistantMessageId,
      model: effectiveModel,
      modelName: effectiveModelName,
    };

    callbacks.onEvent?.({ type: 'error', code: errorCode, message: errorMessage });
    callbacks.onEvent?.({ type: 'done', errorCode, errorMessage });
    callbacks.onError?.(err);

    recordTurnFailed(sessionId, err, { model: effectiveModel }).catch(() => {});

    return errorResult;
  }
}

// ===================== 模型降级 =====================

/**
 * 尝试模型降级 — 错误后自动切换到备用模型重试
 *
 * 降级条件：错误类型为 model_not_supported / timeout / network / server
 * 降级模型选择：优先同 provider 非 reasoning 模型，其次任意可用模型
 *
 * @returns 降级成功返回 RunChatSessionResult，失败返回 null
 */
async function tryFallback(
  error: Error,
  apiMessages: Array<{ role: string; content: any; tool_calls?: any; tool_call_id?: string }>,
  modelsConfig: ModelsFile,
  currentModel: string,
  currentModelConfig: ModelConfig,
  executionMode: ExecutionMode,
  sessionId: string,
  skillId: string | undefined,
  toolProfile: string | undefined,
  compaction: unknown,
  callbacks: RunChatSessionCallbacks,
  timerManager: TimerManager,
  signal: AbortSignal,
): Promise<RunChatSessionResult | null> {
  // 检查错误是否可恢复
  const { AIAPIError } = await import('../aiClient.js');
  if (!(error instanceof AIAPIError)) return null;

  const recoverableCategories = ['model_not_supported', 'timeout', 'network', 'server'];
  if (!recoverableCategories.includes(error.category)) return null;

  // 查找降级模型
  const isModelAvailable = (m: ModelConfig) => {
    if (!m.enabled) return false;
    if (m.apiKey) return true;
    if (m.apiKeys && m.apiKeys.some((k: any) => k.key && k.enabled !== false)) return true;
    return false;
  };

  // 优先：同 provider、非 reasoning、可用
  let fallbackModel = modelsConfig.models.find(
    (m) => m.id !== currentModel && m.enabled && m.provider === currentModelConfig.provider
      && !(m.capabilities || []).includes('reasoning') && isModelAvailable(m),
  );

  // 次选：任意可用模型
  if (!fallbackModel) {
    fallbackModel = modelsConfig.models.find(
      (m) => m.id !== currentModel && m.enabled && isModelAvailable(m),
    );
  }

  if (!fallbackModel) return null;

  const fallbackModelName = fallbackModel.name || fallbackModel.id;
  logger.info(`[runChatSession] 降级到: ${fallbackModelName}`);

  // 通知前端降级
  callbacks.onEvent?.({
    type: 'text',
    content: `\n\n> ⚠️ 模型不支持/请求失败，已自动切换到 **${fallbackModelName}** 重试...\n\n`,
  });

  // 重启心跳
  timerManager.restart('fallback');

  // 构建降级模型配置
  const fallbackKeyResult = selectKey(fallbackModel);
  const fallbackApiKey = fallbackKeyResult ? fallbackKeyResult.key : (fallbackModel.apiKey || '');
  const fallbackModelConfig: ModelCallConfig = {
    ...fallbackModel,
    apiKey: fallbackApiKey,
    // 过滤掉 reasoning capability
    capabilities: (fallbackModel.capabilities || []).filter((c: string) => c !== 'reasoning'),
  };

  const fallbackCtxWindow = fallbackModelConfig.contextWindow || 128000;
  const fallbackCtxMaxTokens = Math.min(fallbackModelConfig.maxTokens || 8192, 8192);

  try {
    const result: ExecuteChatResult = await streamExecuteChat({
      sessionId,
      message: '', // 降级时不需要重新发送用户消息
      model: fallbackModel.id,
      modelName: fallbackModelName,
      modelConfig: fallbackModelConfig,
      apiMessages,
      executionMode,
      timerManager,
      signal,
      modelCapabilities: fallbackModel.capabilities,
      ctxWindow: fallbackCtxWindow,
      ctxMaxTokens: fallbackCtxMaxTokens,
      estimatedToolsCount: 30,
      callbacks: {
        onChunk: (chunk: string) => {
          callbacks.onChunk?.(chunk);
          callbacks.onEvent?.({ type: 'text', content: chunk });
        },
        onThinking: (thinkingChunk: string) => {
          callbacks.onThinking?.(thinkingChunk);
          callbacks.onEvent?.({ type: 'thinking', content: thinkingChunk });
        },
        onToolCall: (toolCall, toolResult) => {
          callbacks.onEvent?.({
            type: 'tool_call',
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            toolArgs: toolCall.function.arguments,
            toolResult,
          });
        },
        onSSEEvent: (event: Record<string, unknown>) => {
          callbacks.onEvent?.(event as { type: string; [key: string]: unknown });
        },
        onRateLimit: async () => {
          const keyResult = selectKey(fallbackModel);
          if (keyResult) {
            return { apiKey: keyResult.key, keyIndex: keyResult.index };
          }
          return null;
        },
      },
      toolProfile: toolProfile as any,
      compaction: compaction as any,
    });

    const toolCallsJson = result.toolCalls && result.toolCalls.length > 0
      ? JSON.stringify(result.toolCalls)
      : undefined;

    // 保存降级后的回复
    addMessage({
      sessionId,
      role: 'assistant',
      content: result.content,
      model: fallbackModel.id,
      skillId: skillId || null,
      toolCalls: toolCallsJson,
      thinking: result.thinkingContent || null,
      thinkingDuration: result.thinkingDuration || null,
    });

    runHooks(createHookEvent('message', 'sent', sessionId, { role: 'assistant', content: result.content })).catch(() => {});

    const fallbackResult: RunChatSessionResult = {
      content: result.content,
      thinkingContent: result.thinkingContent,
      thinkingDuration: result.thinkingDuration,
      thinkingSignature: result.thinkingSignature,
      redacted: result.redacted,
      toolCallsJson,
      usage: result.usage,
      fallbackModel: fallbackModel.id,
      fallbackReason: `降级自 ${currentModel}`,
      model: fallbackModel.id,
      modelName: fallbackModelName,
    };

    callbacks.onEvent?.({
      type: 'done',
      errorCode: null,
      errorMessage: null,
      thinkingDuration: result.thinkingDuration,
      usage: result.usage,
      fallbackModel: fallbackModel.id,
      fallbackReason: `降级自 ${currentModel}`,
    });

    callbacks.onDone?.(fallbackResult);
    return fallbackResult;

  } catch (fallbackError) {
    logger.error('[runChatSession] 降级也失败:', fallbackError);
    return null;
  }
}

// ===================== ACP 适配器 =====================

/**
 * 将 runChatSession 适配为 ACP runtime 的 executeTurn 接口
 *
 * ACP 引擎通过此函数调用 cdf-know 的聊天执行能力
 */
export async function executeTurnViaChatSession(params: {
  sessionId: string;
  text: string;
  model?: string;
  attachments?: unknown[];
  signal?: AbortSignal;
  onEvent?: (event: { type: string; [key: string]: unknown }) => void;
}): Promise<{ content: string; thinking?: string; usage?: unknown }> {
  const result = await runChatSession(
    {
      sessionId: params.sessionId,
      message: params.text,
      model: params.model,
      attachments: params.attachments,
    },
    {
      onEvent: (event) => {
        params.onEvent?.(event);
      },
    },
  );

  return {
    content: result.content,
    thinking: result.thinkingContent,
    usage: result.usage,
  };
}
