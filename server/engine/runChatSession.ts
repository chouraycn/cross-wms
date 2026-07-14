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
import { resolveSkillContext, extractContextTexts } from './skillRouter.js';
import type { ModelCallConfig } from '../aiClient.js';
import { loadModelsConfig, isLocalModel } from '../modelsStore.js';
import type { ModelCapability, ModelConfig, ModelsFile } from '../modelsStore.js';
import { autoSelectModelAsync, generateMockResponse } from '../routes/modelSelector.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import { waitForBackoff } from './backoffWait.js';
import { getBackoffCoordinator } from './backoffCoordinator.js';
import { TimerManager } from '../sse/timerManager.js';
import { ExecutionMode } from './executionStrategy.js';
import { getSessionMessages, addMessage, getSessions, createSession, updateSession } from '../dao/chat.js';
import { extractAndAppendMemory } from '../routes/memoryExtractor.js';
import { triggerTurnEndSync, triggerPostCompactionSync } from './sessionMemorySync.js';
import { compressContextWithSummary } from './contextCompress.js';
import { truncateContextForModel } from './contextTruncate.js';
import contextWindowCache from './contextCache.js';
import { getContextWindowGuard } from './contextWindowGuard.js';
import { TokenBudgetManager } from './compaction/tokenBudget.js';
import { compactionRecovery } from './compaction/compactionRecovery.js';
import { CompactionHooks } from './compaction/compactionHooks.js';
import { getExecutionContractManager } from './executionContract.js';
import { registerBuiltinCommands } from './commands/builtinCommands.js';
import { getThinkingCacheKey, getThinkingCache, setThinkingCache } from '../routes/chatHelpers/thinkingCache.js';
import { matchTriggers, executePluginTrigger } from '../services/pluginAutoInvoke.js';
import { resetDefaultCircuitBreaker } from './toolExecutor.js';
import { recordMessageCreated, recordTurnStarted, recordTurnCompleted, recordTurnFailed } from './eventRecorder.js';
import { classifyAndFormatError } from '../routes/chatService.js';
import { logger } from '../logger.js';
import { runHooks, createHookEvent } from './hooks/index.js';
import { getKeywordTriggerEngine } from './keywordTriggerEngine.js';
import { outputReviewer } from './outputReviewer.js';
import { compactionNotificationManager } from './compaction/compactionNotification.js';
import { reviewStatisticsManager } from './reviewStatistics.js';
import { formatValidator } from './formatValidator.js';
import {
  extractGeneratedFileFromToolResult,
  extractFilesFromMarkerText,
  extractMarkerTextFromToolResult,
  emitFileEvent,
  emitFileEventsForPaths,
} from './generatedFileAttachment.js';
import { createArtifact, findArtifactByFilePath } from '../dao/taskMonitorDao.js';

// ===================== 压缩 Hook 单例 =====================
// 在聊天执行核心中挂载「死」模块 engine/compaction/compactionHooks.ts 的生命周期钩子。
// 既供 builtin commands（如 /compact）注册 before/after/compact-failed 钩子，
// 也由 runChatSession 在「响应后压缩」流程中触发，不改动既有压缩逻辑。
const COMPACTION_HOOKS = new CompactionHooks();

/** 获取压缩 Hook 单例，供外部（如 builtin commands）注册钩子 */
export function getCompactionHooks(): CompactionHooks {
  return COMPACTION_HOOKS;
}

// ===================== 内置命令注册表挂载 =====================
// 将「死」模块 engine/commands（CommandRegistry + builtinCommands）挂载到聊天执行核心。
// 仅执行注册（填充单例），使该模块被实际引用并生效；
// HTTP 聊天路径当前不会自动拦截以 '/' 开头的消息进行分发——实时命令入口是 tui/commands.ts，
// 且 builtinCommands 的 handler 多为占位实现（返回静态文案、不真正切换模型/会话），
// 故此处不自动分发，避免向用户返回误导性虚假回复。需要时可由路由显式调用下方函数触发分发。
let _builtinCommandsRegistered = false;
/** 幂等注册内置命令（首次调用时填充 CommandRegistry 单例） */
export function ensureBuiltinCommandsRegistered(): void {
  if (_builtinCommandsRegistered) return;
  _builtinCommandsRegistered = true;
  registerBuiltinCommands();
}

// 模块加载即注册一次，使 engine/commands 的 CommandRegistry 单例被实际填充（无害：
// 仅注册、不自动分发——实时命令入口仍为 TUI/commands.ts，且 builtinCommands 的 handler
// 多为占位实现；故保持「注册即活跃、分发仍走既有入口」的保守集成策略）。
ensureBuiltinCommandsRegistered();

// ===================== 工具产出文件 → 实时 file 事件（T2/T3） =====================

/**
 * 把工具执行结果中产出的文件经 send 回调实时 emit 为 `file` SSE 事件。
 *
 * 覆盖两类来源：
 * 1. 结构化工具结果（file_generateFile / file_writeFile）—— 直接解析 JSON 得到文件名/URL。
 * 2. FILE:|MEDIA: 标记（exec_command 输出 / skill_* handler 落地文件）—— 扫描 stdout/stderr
 *    抽取绝对路径；skill_* 工具优先读取其 result 中由 skillLoader 写入的 data.generatedFilePaths。
 *
 * 该实时通道与 runChatSession 末尾既有 file_generateFile 写库逻辑并存，不替代任何一方。
 */
function emitToolGeneratedFiles(
  send: ((event: { type: string; [key: string]: unknown }) => void) | undefined,
  sessionId: string,
  toolName: string,
  result: string,
  toolCallId: string,
): void {
  if (!send) return;
  const cb = send;
  try {
    // 1) 结构化工具结果（file_generateFile / file_writeFile）
    const structured = extractGeneratedFileFromToolResult(toolName, result);
    if (structured) emitFileEvent(cb, structured);

    // 2) FILE:/MEDIA: 标记扫描（exec_command / skill_* handler 落地文件）
    let markerPaths: string[] = [];
    if (toolName.startsWith('skill_')) {
      try {
        const parsed: any = JSON.parse(result);
        const gf = parsed?.data?.generatedFilePaths;
        if (Array.isArray(gf)) markerPaths = gf.filter((x: unknown) => typeof x === 'string');
      } catch {
        // 解析失败，回退到文本扫描
      }
    }
    if (markerPaths.length === 0) {
      markerPaths = extractFilesFromMarkerText(extractMarkerTextFromToolResult(result));
    }
    if (markerPaths.length > 0) {
      emitFileEventsForPaths(cb, sessionId, markerPaths, {
        source: toolName.startsWith('skill_') ? 'skill' : 'tool',
        skillId: toolName.startsWith('skill_') ? toolName.slice('skill_'.length) : undefined,
        toolCallId,
      });
    }
  } catch {
    // 文件事件发射失败不影响主流程
  }
}

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
  quality?: string;
  reviewSuggestion?: string;
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
  
  let keywordTriggeredSkillContext = '';
  if (keywordMatches.length > 0) {
    const keywordSkillBlocks: string[] = [];
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
      
      keywordSkillBlocks.push(`<skill name="${match.skillId}">`);
      keywordSkillBlocks.push(`  <name>${match.skillName}</name>`);
      keywordSkillBlocks.push(`  <description>通过关键词 "${match.matchedKeywords.join(', ')}" 自动触发</description>`);
      keywordSkillBlocks.push(`  <matchedKeywords>${match.matchedKeywords.join(', ')}</matchedKeywords>`);
      keywordSkillBlocks.push(`  <matchScore>${match.matchScore.toFixed(2)}</matchScore>`);
      keywordSkillBlocks.push(`  <usage>调用元工具 skill（action="use", id="${match.skillId}"）读取完整技能说明，再按说明用其它工具执行</usage>`);
      keywordSkillBlocks.push('</skill>');
    }
    
    keywordTriggeredSkillContext = `<keyword_triggered_skills>\n以下技能通过关键词自动匹配触发，请优先使用：\n${keywordSkillBlocks.join('\n')}\n</keyword_triggered_skills>`;
  }

  const modelsConfig = await loadModelsConfig();

  let effectiveModel: string;
  let effectiveModelName: string;
  let autoReason: string | undefined;
  let autoReasonType: string | undefined;
  let autoSemanticMethod: string | undefined;
  let autoSemanticConfidence: number | undefined;

  if (model === 'auto') {
    const autoResult = await autoSelectModelAsync(message, modelsConfig as ModelsFile, hasImageAttachment(input.attachments));
    effectiveModel = autoResult.modelId;
    effectiveModelName = autoResult.modelName;
    autoReason = `${autoResult.modelName} · ${autoResult.reason}`;
    autoReasonType = autoResult.reasonType;
    // 联动语义路由透明度：把 [六] 的融合方法与置信度透传前端，便于审计智能路由是否生效
    autoSemanticMethod = autoResult.semanticIntent?.method;
    autoSemanticConfidence = autoResult.semanticIntent?.confidence;
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

  // 执行契约（engine/executionContract）：按模型等级推导每轮最大工具调用数，
  // 替代原先写死的 30，使不同模型档位获得与其契约匹配的并发上限。
  const contractMaxToolCalls = getExecutionContractManager().getContract(effectiveModel).maxToolCallsPerTurn;

  const dbMessages = getSessionMessages(sessionId);
  
  const combinedSkillContext = [input.skillContext, keywordTriggeredSkillContext]
    .filter(Boolean)
    .join('\n\n');
  
  // P2-1b 智能技能路由：在构建消息前，按 query + 上下文自动匹配相关技能并注入 prompt
  const resolvedSkillContext = await resolveSkillContext(
    combinedSkillContext,
    message,
    extractContextTexts(dbMessages, 6),
  );
  const built = await buildApiMessages({
    sessionId,
    message,
    modelConfig: modelConfig as ModelConfig,
    finalModelConfig,
    dbMessages,
    conversationHistory: input.conversationHistory,
    skillContext: resolvedSkillContext,
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
    autoSemanticMethod,
    autoSemanticConfidence,
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
  // [A] ContextWindowCache 预检查：优先用 L1 缓存中可能更新的窗口值，未命中回退 modelConfig
  const cachedCtxInfo = contextWindowCache.getSync(effectiveModel, (modelConfig as ModelConfig).provider);
  const ctxWindow = cachedCtxInfo?.contextWindow || finalModelConfig.contextWindow || 128000;
  if (!cachedCtxInfo) {
    contextWindowCache.set({
      modelId: effectiveModel,
      provider: (modelConfig as ModelConfig).provider || '',
      contextWindow: ctxWindow,
      source: 'config',
      fetchedAt: Date.now(),
      ttl: 0,
    });
  }
  const ctxMaxTokens = Math.min(finalModelConfig.maxTokens || 8192, 8192);
  const tokenBudget = new TokenBudgetManager({ modelLimit: ctxWindow });
  // [C] compactionRecovery 单例统一管理压缩三重安全防护（替代原先逐次 new 三个独立类）；
  // 此处重置以保持单次会话隔离，与原先每次 new 一致的行为。
  compactionRecovery.reset();

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
      // T2/T3: 工具产出文件 → 实时 file 事件
      emitToolGeneratedFiles(
        callbacks.onEvent,
        sessionId,
        toolCall.function.name,
        typeof result === 'string' ? result : String(result ?? ''),
        toolCall.id,
      );
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

  // [B] ContextWindowGuard 调用前安全检查：接近/溢出上下文上限时先压缩或截断，
  // 模型窗口过小则仅记录警告（不阻断流程）。
  const contextGuard = getContextWindowGuard();
  const guardMessages = built.apiMessages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
  }));
  const guardDecision = contextGuard.checkCanProceed(
    effectiveModel,
    guardMessages,
    (modelConfig as ModelConfig).provider,
  );
  if (guardDecision.suggestedAction === 'compact') {
    try {
      const guardCompressed = await compressContextWithSummary(
        built.apiMessages,
        ctxWindow,
        ctxMaxTokens,
        contractMaxToolCalls,
        finalModelConfig,
      );
      if (
        (guardCompressed.compressed || guardCompressed.truncated) &&
        built.apiMessages.length !== guardCompressed.messages.length
      ) {
        built.apiMessages.length = 0;
        built.apiMessages.push(...(guardCompressed.messages as typeof built.apiMessages));
        callbacks.onEvent?.({ type: 'context_guard', action: 'compact', reason: guardDecision.reason });
      }
    } catch (guardErr) {
      logger.warn(
        '[runChatSession] ContextGuard 预压缩失败:',
        guardErr instanceof Error ? guardErr.message : String(guardErr),
      );
    }
  } else if (guardDecision.suggestedAction === 'truncate') {
    try {
      const guardTruncated = truncateContextForModel(
        built.apiMessages as any,
        ctxWindow,
        ctxMaxTokens,
        contractMaxToolCalls,
      );
      if (guardTruncated.truncated && built.apiMessages.length !== guardTruncated.messages.length) {
        built.apiMessages.length = 0;
        built.apiMessages.push(...(guardTruncated.messages as typeof built.apiMessages));
        callbacks.onEvent?.({ type: 'context_guard', action: 'truncate', reason: guardDecision.reason });
      }
    } catch (guardErr) {
      logger.warn(
        '[runChatSession] ContextGuard 预截断失败:',
        guardErr instanceof Error ? guardErr.message : String(guardErr),
      );
    }
  } else if (guardDecision.suggestedAction === 'switch_model') {
    logger.warn(`[runChatSession] ContextGuard 建议切换模型: ${guardDecision.reason}`);
  }

  try {
    const result: ExecuteChatResult = await streamExecuteChat({
      sessionId,
      messageId: assistantMessageId,
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
      estimatedToolsCount: contractMaxToolCalls,
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
    const generatedFiles = (result.toolCalls
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
      .filter((f): f is NonNullable<typeof f> => f != null)) || [];

    // 将生成的文件信息写入 artifacts 表
    for (const file of generatedFiles) {
      try {
        const existing = findArtifactByFilePath(file.filePath);
        if (!existing) {
          createArtifact({
            sessionId,
            messageId: assistantMessageId,
            fileName: file.fileName,
            filePath: file.filePath,
            fileSize: file.fileSize,
            description: file.description,
          });
        }
      } catch (err) {
        logger.warn('[runChatSession] 写入 artifact 失败:', err instanceof Error ? err.message : String(err));
      }
    }

    // Thinking 缓存写入
    if (result.thinkingContent && result.content) {
      setThinkingCache(thinkingCacheKey, result.content, result.thinkingContent);
    }

    // Token 预算管理 + 响应后压缩（三重安全防护）
    if (result.usage) {
      tokenBudget.updateUsage(result.usage as any);
    }
    if (tokenBudget.shouldCompact() && compactionRecovery.canProceed(0)) {
      // --- 压缩 Hook（before-compact，支持中止）---
      const tokensBefore = (result.usage as any)?.totalTokens || 0;
      const beforeSignal = await COMPACTION_HOOKS.runBeforeCompact({
        sessionKey: sessionId,
        trigger: 'budget',
        budgetSnapshot: tokenBudget.getSnapshot(),
        messageCount: built.apiMessages.length,
        tokenCount: tokensBefore,
        timestamp: Date.now(),
      });
      if (beforeSignal.isAborted()) {
        logger.info('[runChatSession] 响应后压缩被 before-compact Hook 中止:', beforeSignal.getReason());
      } else {
      try {
        const compactionResult = await compactionRecovery.withTimeout(
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
        );

        const tokensAfter = compactionResult.compressed ? Math.floor(tokensBefore * 0.5) : tokensBefore;
        compactionRecovery.recordResult(
          tokensBefore,
          tokensAfter,
          compactionRecovery.getStats().timeout.elapsedMs,
        );

        if (compactionResult.compressed) {
          const reductionRatio = tokensBefore > 0 ? (tokensBefore - tokensAfter) / tokensBefore : 0;
          callbacks.onEvent?.({
            type: 'compaction',
            tokensBefore,
            tokensAfter,
            reductionRatio,
          });

          const notification = compactionNotificationManager.addNotification(sessionId, {
            sessionId,
            type: 'compaction',
            level: 'info',
            message: `对话历史已自动压缩，节省了 ${Math.round(reductionRatio * 100)}% 的上下文空间`,
            details: {
              tokensBefore,
              tokensAfter,
              reductionRatio,
              summary: (compactionResult as any).summary,
              trigger: 'budget',
            },
          });

          callbacks.onEvent?.({
            type: 'compaction_notification',
            notification,
          });

          triggerPostCompactionSync(sessionId, input.agentId || 'default').catch(() => {});
        }

        // --- 压缩 Hook（after-compact）---
        await COMPACTION_HOOKS.runAfterCompact({
          sessionKey: sessionId,
          trigger: 'budget',
          messageCount: built.apiMessages.length,
          tokenCount: tokensBefore,
          timestamp: Date.now(),
          compactedMessageCount: compactionResult.compressed
            ? Math.ceil(built.apiMessages.length * 0.5)
            : built.apiMessages.length,
          compactedTokenCount: tokensAfter,
          summary: (compactionResult as any).summary,
          tokenReduction: Math.max(0, tokensBefore - tokensAfter),
          durationMs: compactionRecovery.getStats().timeout.elapsedMs,
        });
      } catch (compactionErr) {
        logger.warn('[runChatSession] 响应后压缩失败:', compactionErr);
        // --- 压缩 Hook（compact-failed）---
        await COMPACTION_HOOKS.runCompactFailed({
          sessionKey: sessionId,
          trigger: 'budget',
          messageCount: built.apiMessages.length,
          tokenCount: tokensBefore,
          timestamp: Date.now(),
          error: compactionErr instanceof Error ? compactionErr.message : String(compactionErr),
          retryCount: compactionRecovery.getStats().retry.attemptCount,
        });
      }
      }
    }

    let outputQuality: string | undefined;
    let reviewSuggestion: string | undefined;
    if (outputReviewer.isEnabled() && result.content) {
      const formatResult = formatValidator.validate(result.content);
      if (formatResult.issues.length > 0) {
        logger.info(`[FormatValidator] Found ${formatResult.issues.length} format issues`);
      }

      const reviewResult = await outputReviewer.review({
        userQuestion: message,
        aiResponse: result.content,
        model: effectiveModelName,
      });
      outputQuality = reviewResult.quality;
      reviewSuggestion = reviewResult.suggestion;
      callbacks.onEvent?.({
        type: 'output_review',
        quality: reviewResult.quality,
        issues: reviewResult.issues,
        suggestion: reviewResult.suggestion,
      });
      logger.info(`[OutputReview] Quality: ${reviewResult.quality}, Issues: ${reviewResult.issues.join(', ')}`);

      reviewStatisticsManager.record({
        sessionId,
        timestamp: Date.now(),
        quality: reviewResult.quality,
        issues: reviewResult.issues,
        suggestion: reviewResult.suggestion,
        model: effectiveModelName,
        responseLength: result.content.length,
        questionLength: message.length,
      });
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
      quality: outputQuality,
      reviewSuggestion,
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
      selectedKeyIndex,
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
  selectedKeyIndex: number,
  requiredCapabilities?: ModelCapability[],
): Promise<RunChatSessionResult | null> {
  // 检查错误是否可恢复
  const { AIAPIError } = await import('../aiClient.js');
  if (!(error instanceof AIAPIError)) return null;

  // ===== 统一退避决策（限流先轮换 Key，连续命中才跨模型降级）=====
  const coordinator = getBackoffCoordinator();

  // 联动 [六] 语义路由：若原模型本身具备 reasoning 能力（复杂任务经 Auto Model 选出的
  // Tier3 推理模型，或用户显式指定的推理模型），降级时保留 reasoning —— 避免对最需要推理
  // 的任务反而降级到非推理模型（等于 [六] 投入在故障边界被清零）。简单任务（原模型无
  // reasoning）仍按历史行为剔除 reasoning 以降本，并让 getNextModel 优先非推理备模型。
  const requiresReasoning = (currentModelConfig.capabilities || []).includes('reasoning');
  const mergedCapabilities: ModelCapability[] | undefined = requiresReasoning
    ? Array.from(new Set<ModelCapability>([...(requiredCapabilities || []), 'reasoning']))
    : requiredCapabilities;

  const decision = coordinator.coordinate({
    modelId: currentModel,
    modelConfig: currentModelConfig,
    keyIndex: selectedKeyIndex,
    error,
    modelsConfig,
    requiredCapabilities: mergedCapabilities,
  });

  if (decision.action === 'give-up') {
    logger.warn(`[runChatSession] 模型 ${currentModel} 无可用降级路径（${decision.reason}）`);
    return null;
  }

  // 解析降级目标：同模型轮换 Key（第一层）或 跨模型切换（第二层）
  let fallbackModel: ModelConfig | null = null;
  let fallbackApiKey = '';
  const isKeyRotation = decision.action === 'rotate-key';

  if (isKeyRotation && decision.apiKey) {
    // 第一层：同一模型，使用协调器选出的健康备用 Key
    fallbackModel = { ...currentModelConfig, apiKey: decision.apiKey };
    fallbackApiKey = decision.apiKey;
  } else if (decision.action === 'switch-model' && decision.nextModelId) {
    // 第二层：跨模型切换
    const fm = modelsConfig.models.find((m) => m.id === decision.nextModelId);
    if (!fm) return null;
    fallbackModel = fm;
  } else {
    return null;
  }

  if (!fallbackModel) return null;

  // 落实 BackoffCoordinator 建议的退避时长：限流/跨模型失败后稍作停顿，
  // 避免对失败模型/Key 做瞬时重放而放大故障面。已被取消则直接放弃。
  if (decision.backoffMs > 0) {
    await waitForBackoff(decision.backoffMs, signal);
    if (signal.aborted) return null;
  }

  const fallbackModelName = fallbackModel.name || fallbackModel.id;
  logger.info(`[runChatSession] 降级到: ${isKeyRotation ? `同模型轮换 Key（${fallbackModel.id}）` : fallbackModelName}`);

  // 通知前端
  callbacks.onEvent?.({
    type: 'text',
    content: isKeyRotation
      ? `\n\n> ⚠️ 当前 API Key 触发限流，已自动切换到备用 Key 重试...\n\n`
      : `\n\n> ⚠️ 模型不支持/请求失败，已自动切换到 **${fallbackModelName}** 重试...\n\n`,
  });

  // 重启心跳
  timerManager.restart('fallback');

  // 构建降级模型配置（跨模型时才需重新 selectKey；同模型轮换已确定 Key）
  if (!isKeyRotation) {
    const fallbackKeyResult = selectKey(fallbackModel);
    fallbackApiKey = fallbackKeyResult ? fallbackKeyResult.key : (fallbackModel.apiKey || '');
  }
  const fallbackModelConfig: ModelCallConfig = {
    ...fallbackModel,
    apiKey: fallbackApiKey,
    // 仅当原任务不需要 reasoning 时才剔除（简单任务降级降本）；复杂/推理任务保留 reasoning
    capabilities: requiresReasoning
      ? fallbackModel.capabilities
      : (fallbackModel.capabilities || []).filter((c: string) => c !== 'reasoning'),
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
      estimatedToolsCount: getExecutionContractManager().getContract(fallbackModel.id).maxToolCallsPerTurn,
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
          // T2/T3: 工具产出文件 → 实时 file 事件（降级重试路径同样接通）
          emitToolGeneratedFiles(
            callbacks.onEvent,
            sessionId,
            toolCall.function.name,
            typeof toolResult === 'string' ? toolResult : String(toolResult ?? ''),
            toolCall.id,
          );
        },
        onSSEEvent: (event: Record<string, unknown>) => {
          callbacks.onEvent?.(event as { type: string; [key: string]: unknown });
        },
        onRateLimit: async () => {
          const keyResult = selectKey(fallbackModel as ModelConfig);
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

    // 同模型轮换成功的 Key 上报成功（原失败 Key 已由协调器标记失败冷却）
    if (isKeyRotation && decision.keyIndex !== undefined) {
      reportKeyResult(currentModel, decision.keyIndex, true);
    }

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
      fallbackReason: isKeyRotation ? 'key_rotation' : 'model_downgrade',
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
      fallbackReason: fallbackResult.fallbackReason,
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
