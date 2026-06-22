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
import os from 'os';
import { AIAPIError, type MessageContent, type ModelCallConfig, type ToolCall } from '../aiClient.js';
import { ExecutionStrategyFactory, ExecutionMode } from '../engine/executionStrategy.js';
import type { ExecutionStrategyOptions } from '../engine/executionStrategy.js';
import type { ToolExecutionResult } from '../engine/toolExecutor.js';
import { getToolRiskLevel } from '../engine/toolExecutor.js';
import { buildSoulSystemMessage } from '../engine/soulLoader.js';
import { estimateMessagesTokens, truncateContextForModel, sanitizeToolMessages } from '../engine/contextTruncate.js';
import { compressContextWithSummary } from '../engine/contextCompress.js';
import { loadModelsConfig, type ModelsFile, isLocalModel, type ModelConfig } from '../modelsStore.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import {
  getSessions,
  createSession,
  getSessionMessages,
  addMessage,
} from '../dao/chat.js';
import { matchTriggers, executePluginTrigger } from '../services/pluginAutoInvoke.js';
import { messageQueue, type QueueMode, type QueueEvent } from '../engine/messageQueue.js';
import { logger } from '../logger.js';
import { autoSelectModel, generateMockResponse, isModelAvailable, MODEL_PRESETS } from './modelSelector.js';
import { extractAndAppendMemory, readMemoryMd } from './memoryExtractor.js';
import {
  permissionEmitter,
  isSystemAuthorized,
  initSessionApprovedTools,
  registerPermissionRequest,
} from './toolPermissionService.js';
import { getAppSettings } from '../dao/settings.js';
import { extractFileContent } from './chatHelpers/fileExtractor.js';
import { getThinkingCacheKey, getThinkingCache, setThinkingCache } from './chatHelpers/thinkingCache.js';
import { activeSSEConnections } from './chatHelpers/sseHelper.js';
import { sendSSE, sendDebugSSE, sendDoneAndEnd } from '../sse/sseTypes.js';
import { TimerManager } from '../sse/timerManager.js';
import { executeChat as streamExecuteChat, finishStream, type ExecuteChatCallbacks } from '../engine/streamExecutor.js';
import { formatMemoryContext } from '../engine/contextEnhancer.js';

const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');

// ===================== 公共辅助函数 =====================

/**
 * 检测附件中是否包含图片
 *
 * 提取为公共函数，消除 handleChat 和 executeFromQueue 中的重复。
 */
function hasImageAttachment(attachments: unknown[] | undefined): boolean {
  return !!(attachments && Array.isArray(attachments) && attachments.some((att) => (att as { type: string }).type === 'image'));
}

/** 已知视觉模型 ID 列表 */
const KNOWN_VISION_MODEL_IDS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
  'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
  'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
  'qwen-vl', 'qwen-vl-max',
  'kimi-k2.6', 'kimi-k2.5',
];

/**
 * 检测模型是否支持视觉（图片理解）
 *
 * 提取为公共函数，消除 handleChat 和 executeFromQueue 中的重复。
 */
function detectVisionModel(modelConfig: { id: string; capabilities?: string[] }): boolean {
  const isMultimodalModel = modelConfig.capabilities?.includes('multimodal');
  const isKnownVisionModel = KNOWN_VISION_MODEL_IDS.some((id) =>
    modelConfig.id.toLowerCase().includes(id.toLowerCase()),
  );
  const isFalsePositiveVision = /deepseek/i.test(modelConfig.id);
  return (isMultimodalModel || isKnownVisionModel) && !isFalsePositiveVision;
}

/**
 * 从 DB 消息重建 tool_calls 到 API 消息格式
 *
 * 提取为公共函数，消除行120-149 和行903-933 的重复。
 * 如果消息包含有效的 toolCalls，将 assistant 消息和对应的 tool 结果消息推入 apiMessages。
 *
 * @returns true 如果成功重建（调用方应 continue 跳过后续处理），false 如果不包含 toolCalls
 */
function rebuildToolCallsFromMessage(
  msg: { role: string; content: string; toolCalls?: string | Array<{ name: string; arguments: string; result?: string }> },
  apiMessages: Array<{ role: string; content: MessageContent | null; tool_calls?: unknown[]; tool_call_id?: string }>,
): boolean {
  if (msg.role !== 'assistant' || !msg.toolCalls) return false;

  try {
    const toolCalls = typeof msg.toolCalls === 'string' ? JSON.parse(msg.toolCalls) : msg.toolCalls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false;

    const callIds = toolCalls.map(() => `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    apiMessages.push({
      role: 'assistant',
      content: msg.content || null,
      tool_calls: toolCalls.map((tc: { name: string; arguments: string }, i: number) => ({
        id: callIds[i],
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });
    for (let i = 0; i < toolCalls.length; i++) {
      apiMessages.push({
        role: 'tool',
        content: (toolCalls[i] as { result?: string }).result ?? '(tool result unavailable)',
        tool_call_id: callIds[i],
      });
    }
    return true;
  } catch {
    // toolCalls 解析失败，按普通消息处理
    return false;
  }
}

/**
 * 验证并修复 tool_calls 配对
 *
 * 确保 assistant(tool_calls) 后面有对应的 tool 消息，
 * 移除孤立的 tool 消息。
 */
function validateToolCallsPairing<T extends Array<{ role: string; content: unknown; tool_calls?: Array<{ id?: string }>; tool_call_id?: string }>>(
  messages: T,
): T {
  const fixedMessages: T[number][] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    // 检查 assistant(tool_calls) 是否有对应的 tool 消息
    if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const neededIds = new Set<string>();
      for (const tc of m.tool_calls) {
        if (tc.id) neededIds.add(tc.id);
      }
      // 向后扫描是否有对应的 tool 消息
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'tool' && messages[j].tool_call_id && neededIds.has(messages[j].tool_call_id!)) {
          neededIds.delete(messages[j].tool_call_id!);
          if (neededIds.size === 0) break;
        } else if (messages[j].role !== 'tool') {
          break;
        }
      }
      if (neededIds.size > 0) {
        logger.warn(`[Chat API] tool_calls 配对不完整，补齐 ${neededIds.size} 条空 tool 响应: ${[...neededIds].join(', ')}`);
        fixedMessages.push(m);
        for (const missingId of neededIds) {
          fixedMessages.push({
            role: 'tool',
            content: '[工具结果未保存]',
            tool_call_id: missingId,
          });
        }
        continue;
      }
    }

    // 检查 tool 消息是否有对应的 assistant(tool_calls)
    if (m.role === 'tool' && m.tool_call_id) {
      let foundParent = false;
      for (let k = fixedMessages.length - 1; k >= 0; k--) {
        const prev = fixedMessages[k] as { role: string; tool_calls?: Array<{ id?: string }> };
        if (prev.role === 'assistant' && prev.tool_calls && Array.isArray(prev.tool_calls)) {
          if (prev.tool_calls.some((tc) => tc.id === m.tool_call_id)) {
            foundParent = true;
            break;
          }
        }
      }
      if (!foundParent) {
        logger.warn(`[Chat API] 跳过孤立 tool 消息 (call_id=${m.tool_call_id})`);
        continue;
      }
    }

    fixedMessages.push(m);
  }

  if (fixedMessages.length !== messages.length) {
    logger.info(`[Chat API] tool_calls 校验: ${messages.length} → ${fixedMessages.length} 条消息`);
  }
  return fixedMessages as T;
}

/**
 * 错误分类与格式化
 *
 * 将 AI API 错误分类为用户友好的错误消息和错误代码。
 */
function classifyAndFormatError(
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
        return { code: 'UNKNOWN_ERROR', message: `AI 服务暂时不可用：${error.message}` };
    }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'ABORTED', message: '请求已取消。' };
  }

  const errMessage = error instanceof Error ? error.message : '未知错误';
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
  /** 已授权工具缓存 */
  sessionApprovedSet: Set<string>;
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
  const { error, apiMessages, modelsConfig, currentModel, modelConfig, res, timerManager, signal, sessionApprovedSet, executionMode, sessionId, skillId } = params;
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
    const fbResult: ToolExecutionResult = await strategy.execute({
      modelConfig: fbModelConfig,
      messages: sanitizeToolMessages(apiMessages) as Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
      maxToolTurns: 10,
      signal: signal ?? new AbortController().signal,
      executionMode,
      approvedToolsCache: sessionApprovedSet,
      onSSEEvent: (evt: Record<string, unknown>) => {
        const evtType = evt.type as string;
        if (['init', 'text', 'thinking', 'tool_call', 'permission_request', 'done', 'error'].includes(evtType)) {
          sendSSE(res, evt);
        } else {
          sendDebugSSE(res, evt);
        }
      },
      onChunk: (chunk: string) => {
        sendSSE(res, { type: 'text', content: chunk });
      },
      onThinking: (thinkingChunk: string) => {
        sendSSE(res, { type: 'thinking', content: thinkingChunk });
      },
      onPermissionRequest: () => Promise.resolve(isSystemAuthorized()),
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
  reasoningEffort?: string;
  executionMode?: string;
  conversationHistory?: any[];
  skillContext?: string;
  skillId?: string;
  attachments?: any[];
  autoReason?: string;
  autoReasonType?: string;
  message: string;
  modelsConfig: ModelsFile;
  sessionApprovedSet: Set<string>;
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

  let apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> = [];

  try {
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

    // 构建 API 消息
    const dbMessages = getSessionMessages(sessionId);
    apiMessages = [];

    const soulSystemMsg = buildSoulSystemMessage();
    if (soulSystemMsg.trim()) {
      apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
    }

    const memoryContent = await readMemoryMd();
    if (memoryContent.trim()) {
      apiMessages.push({ role: 'system', content: memoryContent.trim() });
    }

    if (params.skillContext?.trim()) {
      apiMessages.push({ role: 'system', content: params.skillContext.trim() });
    }

    // 从 DB 消息重建（使用提取的公共函数）
    for (const msg of dbMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        if (rebuildToolCallsFromMessage(msg, apiMessages)) continue;
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // 上下文压缩
    const ctxWindow = (finalModelConfig as ModelCallConfig).contextWindow || 128000;
    const ctxMaxTokens = Math.min((finalModelConfig as ModelCallConfig).maxTokens || 8192, 8192);
    let truncated: { messages: typeof apiMessages; truncated: boolean };
    try {
      const compressResult = await compressContextWithSummary(
        apiMessages as any, ctxWindow, ctxMaxTokens, 30, finalModelConfig,
      );
      truncated = { messages: compressResult.messages as any, truncated: compressResult.truncated || compressResult.compressed };
      if (compressResult.compressed) {
        logger.debug('[Chat API] 上下文已智能压缩（队列模式）');
      }
    } catch {
      truncated = truncateContextForModel(apiMessages as any, ctxWindow, ctxMaxTokens, 30) as { messages: typeof apiMessages; truncated: boolean };
    }

    // 验证 tool_calls 配对（使用提取的公共函数）
    truncated.messages = validateToolCallsPairing(truncated.messages as any) as typeof truncated.messages;

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

    initSessionApprovedTools(sessionId);

    // 设置权限请求回调
    const callbacks: ExecuteChatCallbacks = {
      onPermissionRequest: (toolCall: ToolCall) => {
        const reqId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const toolName = toolCall.function?.name || 'unknown';
        const args = toolCall.function?.arguments || '';
        const riskLevel = getToolRiskLevel(toolName);
        const sessionSet = initSessionApprovedTools(sessionId);
        if (sessionSet?.has(toolName)) return Promise.resolve(true);
        registerPermissionRequest(reqId, toolName, sessionId);
        sendSSE(res, {
          type: 'permission_request',
          reqId,
          toolName,
          args,
          riskLevel,
        });
        return new Promise<boolean>((resolve) => {
          const permTimeout = setTimeout(() => resolve(false), 60000);
          const handler = (approved: boolean) => {
            clearTimeout(permTimeout);
            permissionEmitter.removeListener(reqId, handler);
            if (approved) {
              sessionSet?.add(toolName);
            }
            resolve(approved);
          };
          permissionEmitter.once(reqId, handler);
        });
      },
    };

    // 调用统一执行器
    const result = await streamExecuteChat({
      sessionId,
      message: params.message,
      model: params.model,
      modelName: params.modelName,
      modelConfig: finalModelConfig,
      apiMessages: truncated.messages,
      res,
      executionMode: effectiveMode,
      timerManager,
      signal: abortController.signal,
      reasoningEffort: params.reasoningEffort,
      approvedToolsCache: params.sessionApprovedSet,
      modelCapabilities: modelConfig.capabilities || [],
      ctxWindow,
      ctxMaxTokens,
      estimatedToolsCount: 30,
      callbacks,
      fromQueue: true,
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
      sessionApprovedSet: params.sessionApprovedSet,
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
    reasoningEffort,
    executionMode,
    queueMode,
    agentId,
  } = req.body;

  const sessionId = reqSessionId || uuidv4();
  logger.debug(`[Chat API] 收到请求: sessionId=${sessionId}, model=${model}, agentId=${agentId || 'none'}, message="${message?.slice(0, 30)}", queueMode=${queueMode || 'default'}`);
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    logger.debug(`[Chat API] 附件数量: ${attachments.length}`);
  }

  const timerManager = new TimerManager(res);

  let apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> = [];
  let sessionApprovedSet: Set<string> = new Set();
  let abortController: AbortController = new AbortController();
  let selectedKeyIndex = -1;

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

    if (model === 'auto') {
      const hasImg = hasImageAttachment(attachments);
      try {
        const autoResult = autoSelectModel(message, modelsConfig, hasImg);
        effectiveModel = autoResult.modelId;
        effectiveModelName = autoResult.modelName;
        autoReason = `${autoResult.modelName} · ${autoResult.reason}`;
        autoReasonType = autoResult.reasonType;
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

    // 保存用户消息
    addMessage({ sessionId, role: 'user', content: message, model: effectiveModel, skillId: skillId || null, attachments: attachments || undefined });

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
      preset: activePreset ? { id: preset, label: activePreset.label } : null,
      reasoningEffort: reasoningEffort || null,
    });

    // ============== 队列模式 ==============
    const effectiveQueueMode = queueMode as QueueMode | undefined;
    if (effectiveQueueMode) {
      activeSSEConnections.set(sessionId, { res, assistantMessageId: assistantId });

      const result = messageQueue.enqueue(sessionId, message, effectiveQueueMode, {
        model: effectiveModel,
        modelName: effectiveModelName,
        skillContext,
        skillId,
        preset,
        attachments,
        reasoningEffort,
        executionMode,
        conversationHistory,
        autoReason,
        autoReasonType,
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
            reasoningEffort,
            executionMode,
            conversationHistory,
            skillContext,
            skillId,
            attachments,
            autoReason,
            autoReasonType,
            message,
            modelsConfig,
            sessionApprovedSet: initSessionApprovedTools(sessionId),
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
          reasoningEffort,
          executionMode,
          conversationHistory,
          skillContext,
          skillId,
          attachments,
          autoReason,
          autoReasonType,
          message,
          modelsConfig,
          sessionApprovedSet: initSessionApprovedTools(sessionId),
        });
      }

      return;
    }

    // ============== 直接模式 ==============
    let fullContent = '';
    let thinkingStartTime: number | null = null;
    let hasThinking = false;
    let thinkingContent = '';
    let thinkingChunkCount = 0;
    let toolCallsJson: string | undefined;
    const modelConfig = modelsConfig.models.find((m) => m.id === effectiveModel);

    if (!modelConfig) {
      throw new Error(`未找到模型配置: ${effectiveModel}`);
    }

    const keyResult = selectKey(modelConfig);
    let effectiveApiKey = modelConfig.apiKey || '';
    if (keyResult) {
      effectiveApiKey = keyResult.key;
      selectedKeyIndex = keyResult.index;
    }

    // 构建 API 消息
    apiMessages = [];

    // 图片系统消息
    if (hasImageAttachment(attachments)) {
      apiMessages.push({
        role: 'system',
        content: `你是一个具备视觉理解能力的AI助手，当前用户上传了图片。请遵循以下规则处理图片：\n\n1. **意图识别**：首先识别图片内容（单据、截图、商品、库存、报表等），理解用户上传图片的意图。\n2. **数据提取**：如果图片包含结构化信息（如订单号、商品名称、数量、金额等），请提取关键数据。\n3. **主动执行**：根据图片内容和提取的数据，主动调用相关工具执行操作（如查询库存、创建订单、更新数据等）。\n4. **业务关联**：将图片内容与仓储管理系统（WMS）业务关联，提供有价值的分析和建议。\n5. **清晰回复**：先简要说明你从图片中识别到的内容，然后说明你执行了什么操作或建议什么操作。\n\n注意：不要只是简单描述图片内容，要理解用户意图并采取实际行动。`,
      });
    }

    // Soul 系统消息
    const soulSystemMsg = buildSoulSystemMessage();
    if (soulSystemMsg.trim()) {
      apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
    }

    // Memory.md 内容
    const memoryContent = await readMemoryMd();
    if (memoryContent.trim()) {
      apiMessages.push({ role: 'system', content: memoryContent.trim() });
    }

    // 技能上下文
    if (skillContext && typeof skillContext === 'string' && skillContext.trim()) {
      apiMessages.push({ role: 'system', content: skillContext.trim() });
    }

    // 引用会话
    const referencedSessionIds = req.body.referencedSessionIds;
    if (Array.isArray(referencedSessionIds) && referencedSessionIds.length > 0) {
      let sessionContext = '';
      for (const refId of referencedSessionIds) {
        const refMessages = getSessionMessages(refId);
        if (refMessages.length > 0) {
          const sessionInfo = getSessions().find((s: { id: string }) => s.id === refId);
          const sessionTitle = sessionInfo ? sessionInfo.title : refId;
          sessionContext += `\n## 会话：${sessionTitle}\n`;
          for (const msg of refMessages.slice(-10)) {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            sessionContext += `${role}: ${msg.content}\n`;
          }
        }
      }
      if (sessionContext) {
        apiMessages.push({ role: 'system', content: `<referenced-sessions>\n${sessionContext}\n</referenced-sessions>` });
      }
    }

    // 视觉模型检测（使用提取的公共函数）
    const supportsVision = detectVisionModel(modelConfig);

    // 从 conversationHistory 构建消息（使用提取的公共函数重建 tool_calls）
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          if (msg.role === 'user' && msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && supportsVision) {
            const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];
            if (msg.content) {
              contentParts.push({ type: 'text', text: msg.content });
            }
            for (const att of msg.attachments) {
              if (att.type === 'image') {
                try {
                  const filePath = path.join(CDF_KNOW_CLOW_DIR, 'uploads', path.basename(att.url));
                  const fileBuffer = await fsp.readFile(filePath);
                  const base64 = fileBuffer.toString('base64');
                  contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:${att.mimeType};base64,${base64}`, detail: 'auto' },
                  });
                } catch (err: any) {
                  if (err.code !== 'ENOENT') {
                    logger.error(`[Chat API] 读取历史图片附件失败: ${att.fileName}`, err);
                  }
                }
              }
            }
            if (contentParts.length > 0) {
              apiMessages.push({ role: msg.role, content: contentParts });
            } else {
              apiMessages.push({ role: msg.role, content: msg.content });
            }
          } else if (rebuildToolCallsFromMessage(msg, apiMessages)) {
            // tool_calls 已重建，继续下一条
            continue;
          } else {
            apiMessages.push({ role: msg.role, content: msg.content });
          }
        }
      }
    }

    // 当前消息附件处理
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];
      const effectiveMessage = message?.trim() || '请仔细识别并分析这张图片的内容，理解用户的意图，然后根据图片内容和你的能力采取相应的行动（如调用工具查询数据、生成报表、执行操作等）。如果图片包含单据、订单、库存、商品等信息，请提取关键数据并执行相关业务操作。';
      contentParts.push({ type: 'text', text: effectiveMessage });

      if (hasImageAttachment(attachments) && !supportsVision) {
        contentParts.push({
          type: 'text',
          text: `\n⚠️ [系统提示] 当前模型 "${modelConfig.name}" (${modelConfig.id}) 不支持图片理解。已上传图片但模型无法识别内容。如需分析图片，请切换到支持多模态的模型，如：\n- GPT-4o (OpenAI)\n- Claude 3 Sonnet/Opus (Anthropic)\n- Gemini 1.5 Pro (Google)\n- Qwen-VL (阿里云)\n`,
        });
      }

      for (const att of attachments) {
        if (att.type === 'image') {
          if (supportsVision) {
            try {
              const filePath = path.join(CDF_KNOW_CLOW_DIR, 'uploads', path.basename(att.url));
              const fileBuffer = await fsp.readFile(filePath);
              const base64 = fileBuffer.toString('base64');
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${att.mimeType};base64,${base64}`, detail: 'auto' },
              });
            } catch (err: any) {
              if (err.code !== 'ENOENT') {
                logger.error(`[Chat API] 读取图片附件失败: ${att.fileName}`, err);
              }
            }
          }
        } else {
          try {
            const filePath = path.join(CDF_KNOW_CLOW_DIR, 'uploads', path.basename(att.url));
            const ext = path.extname(att.fileName).toLowerCase().replace('.', '');
            const fileContent = await extractFileContent(filePath, ext, att.fileName);
            contentParts.push({ type: 'text', text: fileContent });
          } catch (err: any) {
            if (err.code !== 'ENOENT') {
              logger.error(`[Chat API] 读取文件附件失败: ${att.fileName}`, err);
              contentParts.push({ type: 'text', text: `\n---\n[附件: ${att.fileName} - 读取失败]\n---\n` });
            }
          }
        }
      }

      apiMessages.push({ role: 'user', content: contentParts });
    } else {
      apiMessages.push({ role: 'user', content: message });
    }

    // 构建最终模型配置
    const finalModelConfig: ModelCallConfig = {
      ...modelConfig,
      apiKey: effectiveApiKey,
      temperature: activePreset ? activePreset.temperature : modelConfig.temperature,
      topP: activePreset ? activePreset.topP : modelConfig.topP,
    };

    // 创建 AbortController + 超时
    abortController = new AbortController();
    let timeoutMs: number;
    if (isLocalModel(modelConfig)) {
      timeoutMs = 300000;
    } else if (reasoningEffort === 'max') {
      timeoutMs = 600000;
    } else if (reasoningEffort === 'high') {
      timeoutMs = 300000;
    } else {
      timeoutMs = 120000;
    }
    let timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      // 无 API Key 且非本地模型 → 模拟模式
      if (!effectiveApiKey && !isLocalModel(modelConfig)) {
        logger.debug(`[Chat API] 模型 ${effectiveModel} 未配置 API Key，使用模拟模式`);
        const mockResponse = generateMockResponse(message);
        const segments = mockResponse.match(/[\s\S]{1,5}/g) || [mockResponse];
        for (const segment of segments) {
          sendSSE(res, { type: 'text', content: segment });
          await new Promise((r) => setTimeout(r, 15));
        }
        fullContent = mockResponse;
      } else {
        sessionApprovedSet = initSessionApprovedTools(sessionId);

        // Thinking 缓存检查
        let cacheHit = false;
        if (reasoningEffort) {
          const cacheKey = getThinkingCacheKey(effectiveModel, message, reasoningEffort);
          const cached = getThinkingCache(cacheKey);
          if (cached) {
            logger.debug('[Chat API] Thinking cache hit for', effectiveModel);
            cacheHit = true;
            fullContent = cached.content;
            thinkingContent = cached.thinking;
            hasThinking = !!thinkingContent;
            if (hasThinking) thinkingStartTime = 0;
            if (thinkingContent) {
              sendSSE(res, { type: 'thinking', content: thinkingContent });
            }
            sendSSE(res, { type: 'text', content: fullContent });
            sendDebugSSE(res, { type: 'cache_hit', cached: true });
          }
        }

        if (!cacheHit) {
          // 确定执行模式
          let effectiveMode = (executionMode && Object.values(ExecutionMode).includes(executionMode as ExecutionMode))
            ? (executionMode as ExecutionMode)
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

          const ctxWindow = (finalModelConfig as ModelCallConfig).contextWindow || 128000;
          const ctxMaxTokens = Math.min((finalModelConfig as ModelCallConfig).maxTokens || 8192, 8192);
          const estimatedToolsCount = 30;

          // 设置回调
          const callbacks: ExecuteChatCallbacks = {
            onThinking: (thinkingChunk: string) => {
              // 插件自动触发匹配（保留原有功能）
              thinkingChunkCount++;
              if (thinkingChunkCount % 5 === 0 && thinkingContent.length > 20) {
                matchTriggers(thinkingContent, sessionId).then((matches) => {
                  for (const match of matches) {
                    sendDebugSSE(res, {
                      type: 'client_tool',
                      tool: match.toolName,
                      args: match.args,
                      pluginId: match.pluginId,
                    });
                    executePluginTrigger(match).then((result) => {
                      sendDebugSSE(res, {
                        type: 'plugin_result',
                        tool: match.toolName,
                        output: result.output,
                        durationMs: result.durationMs,
                        pluginId: match.pluginId,
                      });
                    }).catch((err) => {
                      logger.error('[Chat API] plugin trigger execution failed:', err);
                    });
                  }
                }).catch((err) => {
                  logger.error('[Chat API] trigger matching failed:', err);
                });
              }
            },
            onPermissionRequest: (toolCall: ToolCall) => {
              if (isSystemAuthorized()) {
                logger.debug('[Chat API] 系统授权已启用，自动通过工具权限:', toolCall.function.name);
                return Promise.resolve(true);
              }
              return new Promise<boolean>((resolve) => {
                const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                registerPermissionRequest(reqId, toolCall.function.name, sessionId);
                sendSSE(res, {
                  type: 'permission_request',
                  reqId,
                  toolName: toolCall.function.name,
                  toolArgs: toolCall.function.arguments,
                  riskLevel: getToolRiskLevel(toolCall.function.name),
                });
                // 暂停 abort 超时
                clearTimeout(timeout);
                timeout = null as any;
                const handler = (approved: boolean) => {
                  permissionEmitter.removeListener(reqId, handler);
                  // 恢复 abort 超时
                  timeout = setTimeout(() => abortController.abort(), timeoutMs);
                  sendDebugSSE(res, {
                    type: 'tool_audit',
                    toolName: toolCall.function.name,
                    result: approved ? 'approved' : 'denied',
                    timestamp: Date.now(),
                  });
                  resolve(approved);
                };
                permissionEmitter.once(reqId, handler);
              });
            },
            onRateLimit: async () => {
              if (selectedKeyIndex >= 0 && effectiveModel) {
                reportKeyResult(effectiveModel, selectedKeyIndex, false);
              }
              const nextKey = selectKey(modelConfig);
              if (nextKey) {
                selectedKeyIndex = nextKey.index;
                logger.debug(`[Chat API] 429 速率限制，切换到备用 Key #${nextKey.index}`);
                return { apiKey: nextKey.key, keyIndex: nextKey.index };
              }
              return null;
            },
          };

          // 调用统一执行器
          const result = await streamExecuteChat({
            sessionId,
            message,
            model: effectiveModel,
            modelName: effectiveModelName,
            modelConfig: finalModelConfig,
            apiMessages,
            res,
            executionMode: effectiveMode,
            timerManager,
            signal: abortController.signal,
            reasoningEffort,
            approvedToolsCache: sessionApprovedSet,
            modelCapabilities: modelConfig.capabilities || [],
            ctxWindow,
            ctxMaxTokens,
            estimatedToolsCount,
            callbacks,
          });

          fullContent = result.content;
          thinkingContent = result.thinkingContent;
          hasThinking = result.hasThinking;
          thinkingStartTime = result.thinkingDuration > 0 ? Date.now() - result.thinkingDuration : null;
          toolCallsJson = result.toolCalls?.length > 0 ? JSON.stringify(result.toolCalls) : undefined;

          // Thinking 缓存
          if (reasoningEffort && thinkingContent) {
            const cacheKey = getThinkingCacheKey(effectiveModel, message, reasoningEffort);
            setThinkingCache(cacheKey, fullContent, thinkingContent);
          }

          // 注入语义记忆到结果（通过 contextEnhancer 的结果）
          if (result.enhancement.memories && result.enhancement.memories.length > 0) {
            const memCtx = formatMemoryContext(result.enhancement.memories);
            if (memCtx) {
              logger.debug(`[Chat API] 语义记忆检索: ${result.enhancement.memories.length} 条 (后台增强)`);
              sendDebugSSE(res, {
                type: 'memory_retrieved',
                count: result.enhancement.memories.length,
                summaries: result.enhancement.memories.map((r) => r.entry.content.substring(0, 50)),
              });
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      timerManager.stopAll();
    }

    // 保存助手消息到 DB
    const thinkingDuration = (hasThinking && thinkingStartTime) ? Date.now() - thinkingStartTime : 0;
    addMessage({
      sessionId,
      role: 'assistant',
      content: fullContent,
      model: effectiveModel,
      skillId: skillId || null,
      toolCalls: toolCallsJson,
      thinking: thinkingContent || null,
      thinkingDuration: thinkingDuration || null,
    });

    if (selectedKeyIndex >= 0 && effectiveModel) {
      reportKeyResult(effectiveModel, selectedKeyIndex, true);
    }

    // 后台提取记忆
    extractAndAppendMemory(
      message,
      fullContent,
      apiMessages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
    ).catch(() => {});

    // 发送 done 事件
    await finishStream(res, timerManager, {
      thinkingDuration,
    });

  } catch (error) {
    logger.error('Chat API error:', error);
    logger.error('[Chat API] Stack trace:', error instanceof Error ? error.stack : 'N/A');

    timerManager.stopAll();

    // 尝试降级
    const modelsConfig = await loadModelsConfig().catch(() => null);
    const modelConfig = modelsConfig?.models.find((m) => m.id === (req.body.model === 'auto' ? '' : req.body.model));

    const fallbackSuccess = modelsConfig ? await handleFallback({
      error,
      apiMessages,
      modelsConfig,
      currentModel: req.body.model === 'auto' ? '' : req.body.model,
      modelConfig,
      res,
      timerManager,
      signal: abortController?.signal,
      sessionApprovedSet,
      executionMode: ExecutionMode.REACT,
      sessionId,
      skillId,
    }) : false;

    if (!fallbackSuccess) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        const { code, message: errMsg } = classifyAndFormatError(error, modelConfig, req.body.model);
        sendSSE(res, { type: 'text', content: errMsg });

        // 保存错误消息到 DB
        try {
          addMessage({ sessionId, role: 'assistant', content: errMsg, model: req.body.model || 'unknown', skillId: skillId || null });
        } catch { /* ignore */ }

        if (selectedKeyIndex >= 0) {
          reportKeyResult(req.body.model, selectedKeyIndex, false);
        }

        await finishStream(res, timerManager, {
          errorCode: code,
          errorMessage: errMsg,
        });
      }
    }
  }
}

export { activeSSEConnections } from './chatHelpers/sseHelper.js';
