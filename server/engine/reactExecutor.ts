/**
 * ReAct 执行器 — 简化版 3 步循环（v7.0）
 *
 * 核心流程：
 * 1. REASONING：调用 AI 模型获取推理和工具调用
 * 2. ACTING：分组并行执行工具调用
 * 3. OBSERVING：观察结果 + 轻量压缩
 *
 * v7.0 简化变更：
 * - 7 步循环 → 3 步循环（移除评估/规划/反思/语义压缩阶段）
 * - 复杂度评估移至 contextEnhancer.ts（后台并行执行）
 * - 反思阶段默认关闭（移除 reflectionPhase / llmReflect / selfEvaluation）
 * - 上下文压缩改为每 5 轮一次（替代每轮压缩）
 * - 保留安全机制：CircuitBreaker / BudgetManager / LoopDetector / tool_calls 配对防护
 *
 * 终止条件：
 * 1. AI 不调用工具 → 任务完成
 * 2. 预算超限 → budget_exceeded
 * 3. 死循环检测 → ask_user
 * 4. 达到 maxTurns → 返回已收集结果
 * 5. AbortSignal → 抛出取消错误
 */

import {
  callAIModelStream,
  type AIResponse,
  type ModelCallConfig,
  type ToolCall,
  type MessageContent,
} from '../aiClient.js';
import { Observer, type Observation } from './observer.js';
import { Planner, type ExecutionPlan } from './planner.js';
import { getBuiltinToolDefinitions } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { mcpClientManager } from './mcpClientManager.js';
import { compressContextWithSummary } from './contextCompress.js';
import { truncateContextForModel, estimateMessagesTokens } from './contextTruncate.js';
import type { ToolExecutionResult } from './toolExecutor.js';
import type { ExecutionStrategyOptions } from './executionStrategy.js';
import { BudgetManager, type BudgetConfig } from './budgetManager.js';
import { LoopDetector } from './loopDetector.js';
import { ObservationCompressor, needsCompression } from './observationCompressor.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { ToolDependencyGraph } from './toolDependencyGraph.js';
import { ActionPhaseExecutor } from './actionPhaseExecutor.js';
import { AutoCompressor } from './autoCompressor.js';
import { getModelFailoverManager, type ModelFailoverOptions } from './modelFailover.js';
import pluginHooks from './pluginHooks.js';
import { logger } from '../logger.js';

// ===================== 类型定义（向后兼容） =====================

/** ReAct 循环阶段（保留 'reflecting' 类型定义，但 v7.0 不再使用） */
export type ReActPhase = 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done';

/** 自评分结果（v5.1 定义，v7.0 不再使用，保留导出以维持向后兼容） */
export interface SelfEvaluation {
  /** 评分等级 */
  grade: 'A' | 'B' | 'C' | 'D';
  /** 评分理由 */
  reason: string;
}

/** ReAct 反思决策（v5.0 定义，v7.0 不再使用，保留导出以维持向后兼容） */
export interface ReActReflectionDecision {
  /** 是否继续循环 */
  shouldContinue: boolean;
  /** 决策原因 */
  reason: string;
  /** 注入到上下文的反思文本（可选） */
  reflectionMessage?: string;
  /** 置信度评分 (1-10) */
  confidenceScore: number;
  /** 决策类型 */
  decision: 'continue' | 'early_stop' | 'replan';
  /** 自评分结果 */
  selfEvaluation?: SelfEvaluation;
}

/** ReAct 执行结果 — 扩展 ToolExecutionResult */
export interface ReActExecutionResult extends ToolExecutionResult {
  /** 执行计划（v7.0 不再使用，始终为 undefined） */
  plan?: ExecutionPlan;
  /** 所有观察结果 */
  observations: Observation[];
  /** 总循环轮数 */
  totalTurns: number;
  /** 是否提前终止 */
  earlyTermination: boolean;
}

/** ReAct SSE 阶段事件 */
export interface ReActPhaseEvent {
  type: 'react_phase';
  phase: ReActPhase;
  step?: number;
  totalSteps?: number;
  description?: string;
}

/** ReAct 内部状态 */
interface ReActState {
  /** 当前阶段 */
  phase: ReActPhase;
  /** 当前轮数 */
  turn: number;
  /** 是否应该终止 */
  shouldTerminate: boolean;
  /** 终止原因 */
  terminateReason: string;
  /** 当前复杂度等级（供 actionPhaseExecutor 上下文使用） */
  currentComplexityLevel: 'simple' | 'moderate' | 'complex';
  /** 是否提前终止 */
  earlyTermination: boolean;
}

/** 上下文压缩间隔（每 5 轮压缩一次） */
const CONTEXT_COMPRESS_INTERVAL = 5;

// ===================== ReActExecutor =====================

/**
 * ReAct 执行器 — 简化版 3 步循环（v7.0）
 *
 * 保留的安全机制：
 * - BudgetManager: 预算管理（轮数 + Token 双模）
 * - LoopDetector: 死循环检测 + 升级策略
 * - CircuitBreaker: 工具熔断器
 * - tool_calls 配对防护（assistant + tool 消息成对推送）
 * - ObservationCompressor: 观察结果轻量压缩
 */
export class ReActExecutor {
  private _observer?: Observer;
  private _planner?: Planner;
  private _state?: ReActState;
  private _budgetManager?: BudgetManager;
  private _loopDetector?: LoopDetector;
  private _observationCompressor?: ObservationCompressor;
  private _circuitBreaker?: CircuitBreaker;
  private _dependencyGraph?: ToolDependencyGraph;
  private _budgetConfig?: Partial<BudgetConfig>;
  private _actionPhaseExecutor?: ActionPhaseExecutor;
  private _autoCompressor?: AutoCompressor;
  private _modelFailoverOptions?: ModelFailoverOptions;

  // 懒加载访问器 — 避免构造函数中一次性创建所有对象
  private get observer(): Observer {
    return this._observer ?? (this._observer = new Observer());
  }
  private get planner(): Planner | undefined {
    return this._planner;
  }
  private get state(): ReActState {
    return this._state ?? (this._state = this.createInitialState());
  }
  private set state(value: ReActState) {
    this._state = value;
  }
  private get budgetManager(): BudgetManager {
    return this._budgetManager ?? (this._budgetManager = new BudgetManager(this._budgetConfig));
  }
  private get loopDetector(): LoopDetector {
    return this._loopDetector ?? (this._loopDetector = new LoopDetector());
  }
  private get observationCompressor(): ObservationCompressor {
    return this._observationCompressor ?? (this._observationCompressor = new ObservationCompressor());
  }
  private get circuitBreaker(): CircuitBreaker {
    return this._circuitBreaker ?? (this._circuitBreaker = new CircuitBreaker());
  }
  private get dependencyGraph(): ToolDependencyGraph {
    return this._dependencyGraph ?? (this._dependencyGraph = new ToolDependencyGraph());
  }
  private get actionPhaseExecutor(): ActionPhaseExecutor {
    return this._actionPhaseExecutor ?? (this._actionPhaseExecutor = new ActionPhaseExecutor({
      circuitBreaker: this.circuitBreaker,
      dependencyGraph: this.dependencyGraph,
      extractUserMessage: (messages) => this.extractUserMessage(messages),
      getState: () => ({
        currentComplexityLevel: this.state.currentComplexityLevel,
        turn: this.state.turn,
      }),
    }));
  }
  private get autoCompressor(): AutoCompressor {
    return this._autoCompressor ?? (this._autoCompressor = new AutoCompressor({
      trigger: 'turn_interval',
      turnInterval: 5,
      preserveRecent: 5,
      preserveSystem: true,
    }));
  }

  /**
   * 构造函数（签名不变，保持向后兼容）
   *
   * @param observer - Observer 实例（可选，懒加载）
   * @param planner - Planner 实例（v7.0 不再使用，保留参数兼容）
   * @param budgetConfig - 预算配置
   */
  constructor(observer?: Observer, planner?: Planner, budgetConfig?: Partial<BudgetConfig>) {
    this._observer = observer;
    this._planner = planner;
    this._budgetConfig = budgetConfig;
    this._state = this.createInitialState();
  }

  /** 创建初始状态 */
  private createInitialState(): ReActState {
    return {
      phase: 'reasoning',
      turn: 0,
      shouldTerminate: false,
      terminateReason: '',
      currentComplexityLevel: 'moderate',
      earlyTermination: false,
    };
  }

  /**
   * 执行 ReAct 3 步循环：推理 → 执行 → 观察
   *
   * @param options - 执行策略选项
   * @returns ReAct 执行结果
   */
  async execute(options: ExecutionStrategyOptions): Promise<ReActExecutionResult> {
    const {
      modelConfig,
      messages,
      maxToolTurns = 10,
      signal,
      onChunk,
      onThinking,
      onToolCall,
      modelCapabilities,
      onSSEEvent,
      sessionId,
    } = options;

    // 推送初始 SSE 反馈 — 让用户在首 token 到达前就看到"AI 正在处理"
    if (onSSEEvent) {
      onSSEEvent({
        type: 'react_phase',
        phase: 'reasoning',
        step: 0,
        totalSteps: undefined,
        description: 'AI 正在分析您的请求...',
      });
    }

    // 重置状态（懒加载模块仅在已创建时才重置，避免强制初始化）
    this._state = this.createInitialState();
    this._loopDetector?.reset();
    this._circuitBreaker?.reset();
    this._autoCompressor?.reset();

    // 获取工具定义（内置 + 插件 + MCP）
    const builtinTools = getBuiltinToolDefinitions();
    const pluginTools = pluginRegistry.getActiveTools();
    const mcpTools = mcpClientManager.getMcpTools();
    const tools = [...builtinTools, ...pluginTools, ...mcpTools];

    // 复制消息列表
    const currentMessages = [...messages];
    let finalContent = '';
    const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];
    const allObservations: Observation[] = [];

    // ============== 3 步循环：推理 → 执行 → 观察 ==============
    for (let turn = 0; turn < maxToolTurns; turn++) {
      this.state.turn = turn + 1;

      // 检查终止条件
      if (signal?.aborted) {
        throw new Error('请求已取消');
      }
      if (this.state.shouldTerminate) {
        break;
      }

      // ============== Budget 检查 ==============
      this.budgetManager.incrementTurn();
      const budgetCheck = this.budgetManager.checkBudget();
      if (budgetCheck.exceeded) {
        if (onSSEEvent) {
          onSSEEvent({
            type: 'budget_exceeded',
            reason: budgetCheck.reason,
            consumedTurns: budgetCheck.consumedTurns,
            consumedTokens: budgetCheck.consumedTokens,
            maxTurns: this.budgetManager.getMaxTurns(),
            maxTokens: this.budgetManager.getMaxTokens(),
          });
        }
        this.state.shouldTerminate = true;
        this.state.terminateReason = 'budget_exceeded';
        break;
      }

      // ============== 上下文截断（双重防护）=============
      const ctxWindow = (modelConfig as unknown as Record<string, unknown>).contextWindow as number || 128000;
      const ctxMaxTokens = Math.min(modelConfig.maxTokens || 8192, 8192);
      const estimatedTokens = estimateMessagesTokens(currentMessages);
      const tokenThreshold = ctxWindow * 0.8;

      // 追踪当前轮次（用于 autoCompressor）
      this.autoCompressor.trackTurn(currentMessages, estimatedTokens);

      // v7.1-fix: 每轮检查 token 估算，接近阈值时立即截断（替代仅每 5 轮检查）
      // v9.2: 同时检查 autoCompressor 的 shouldCompress
      const shouldCompress = (turn > 0 && turn % CONTEXT_COMPRESS_INTERVAL === 0) || this.autoCompressor.shouldCompress();
      const shouldTruncate = estimatedTokens > tokenThreshold;

      if (shouldCompress || shouldTruncate) {
        if (shouldTruncate && !shouldCompress) {
          logger.warn(
            `[ReActExecutor] 第 ${turn} 轮 token 估算(${estimatedTokens})超过阈值(${tokenThreshold})，触发紧急截断`,
          );
        }
        
        // v9.2: 如果 autoCompressor 判断需要压缩，先获取压缩计划
        let compressionPlan = null;
        if (this.autoCompressor.shouldCompress()) {
          try {
            compressionPlan = this.autoCompressor.getCompressionPlan(currentMessages);
            logger.debug(
              `[ReActExecutor] 第 ${turn} 轮 AutoCompressor 触发压缩计划，级别: ${compressionPlan.level}, ` +
              `预估节省: ${(compressionPlan.estimatedSavingsRatio * 100).toFixed(1)}%`,
            );
          } catch (planErr) {
            logger.warn('[ReActExecutor] 获取压缩计划失败，使用默认压缩:', planErr);
          }
        }
        
        try {
          const turnTruncated = await compressContextWithSummary(
            currentMessages,
            ctxWindow,
            ctxMaxTokens,
            tools.length,
            modelConfig,
          );
          if ((turnTruncated.compressed || turnTruncated.truncated)
            && currentMessages.length !== turnTruncated.messages.length) {
            currentMessages.length = 0;
            currentMessages.push(...turnTruncated.messages as typeof currentMessages);
            // 标记压缩已执行
            this.autoCompressor.markCompressed();
            logger.debug(`[ReActExecutor] 第 ${turn} 轮上下文智能压缩完成`);
          }
        } catch (compressErr) {
          logger.warn(
            '[ReActExecutor] 上下文智能压缩失败，降级为硬截断:',
            compressErr instanceof Error ? compressErr.message : String(compressErr),
          );
          // v7.1-fix: 智能压缩失败时降级为硬截断，确保不超限
          const hardTruncated = truncateContextForModel(
            currentMessages as any,
            ctxWindow,
            ctxMaxTokens,
            tools.length,
          );
          if (hardTruncated.truncated && currentMessages.length !== hardTruncated.messages.length) {
            currentMessages.length = 0;
            currentMessages.push(...hardTruncated.messages as typeof currentMessages);
            logger.debug(`[ReActExecutor] 第 ${turn} 轮上下文硬截断完成`);
          }
        }
      }

      // ============== Step 1: REASONING 阶段 ==============
      this.state.phase = 'reasoning';
      this.emitPhase(onSSEEvent, 'reasoning', turn + 1, maxToolTurns);

      // 触发 before_ai_call 钩子
      await pluginHooks.executeHooks('before_ai_call', {
        sessionId,
        messages: currentMessages as Array<Record<string, unknown>>,
        extra: { phase: 'reasoning', turn: turn + 1 },
      });

      const response = await this.reasoningPhase(currentMessages, {
        modelConfig,
        signal,
        onChunk,
        onThinking,
        tools,
        modelCapabilities,
        sessionId,
      });

      // 触发 after_ai_call 钩子
      await pluginHooks.executeHooks('after_ai_call', {
        sessionId,
        messages: currentMessages as Array<Record<string, unknown>>,
        aiResult: response as unknown as Record<string, unknown>,
        extra: { phase: 'reasoning', turn: turn + 1 },
      });

      // 累积文本输出
      if (response.content) {
        finalContent += response.content;
        if (!finalContent.endsWith('\n')) {
          finalContent += '\n';
        }
      }

      // 累积 Token 使用量
      this.budgetManager.accumulateTokens(undefined, response.content || '');

      // AI 不调用任何工具 → 任务完成
      if (!response.toolCalls || response.toolCalls.length === 0) {
        this.state.shouldTerminate = true;
        this.state.terminateReason = 'task_completed';
        this.state.phase = 'done';
        this.emitPhase(onSSEEvent, 'done', turn + 1, maxToolTurns, '任务完成');
        break;
      }

      // 添加 assistant 消息（含 tool_calls）— tool_calls 配对防护
      // OpenAI 规范：有 tool_calls 时 content 必须是 null（不能是 ''）
      currentMessages.push({
        role: 'assistant',
        content: response.toolCalls.length > 0
          ? (response.content || null)
          : (response.content || ''),
        reasoning_content: response.reasoningContent,
        tool_calls: response.toolCalls.map((tc: ToolCall) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      } as typeof currentMessages[number]);

      // ============== Step 2: ACTING 阶段 ==============
      this.state.phase = 'acting';
      this.emitPhase(onSSEEvent, 'acting', turn + 1, maxToolTurns);

      const actionResults = await this.actionPhase(response, {
        onToolCall,
        executedToolCalls,
        currentMessages,
      });

      // 将工具结果添加到消息上下文 — tool_calls 配对防护
      // 必须在 assistant(tool_calls) 之后立即推送 tool 消息
      for (const [toolCall, result] of actionResults) {
        currentMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        } as typeof currentMessages[number]);
      }

      // ============== Step 3: OBSERVING 阶段 ==============
      this.state.phase = 'observing';
      this.emitPhase(onSSEEvent, 'observing', turn + 1, maxToolTurns);

      const observations = this.observationPhase(actionResults);
      allObservations.push(...observations);

      // ============== Circuit Breaker — 记录成功/失败 ==============
      for (const obs of observations) {
        if (obs.assessment.level === 'success') {
          this.circuitBreaker.recordSuccess(obs.toolCall.name);
        } else {
          const circuitState = this.circuitBreaker.recordFailure(
            obs.toolCall.name,
            obs.assessment.reason,
          );

          // half_open → 注入备选工具建议
          if (circuitState === 'half_open') {
            const suggestion = this.circuitBreaker.getAlternativeSuggestion(obs.toolCall.name);
            if (suggestion) {
              currentMessages.push({
                role: 'system',
                content: `[熔断器] ${suggestion}`,
              } as typeof currentMessages[number]);
            }
          }

          // open → 熔断告警 SSE（不终止循环，仅跳过该工具）
          if (circuitState === 'open') {
            const record = this.circuitBreaker.getRecord(obs.toolCall.name);
            if (onSSEEvent) {
              onSSEEvent({
                type: 'circuit_breaker_triggered',
                toolName: obs.toolCall.name,
                failureCount: record?.consecutiveFailures ?? 0,
                state: 'open',
                alternativeTool: record?.alternativeTool,
              });
            }
            logger.warn(`[ReActExecutor] 工具 ${obs.toolCall.name} 已熔断，后续轮次将跳过`);
          }
        }
      }

      // ============== Loop Detection — 死循环检测 ==============
      const loopResult = this.loopDetector.detectLoop(observations, turn);
      if (loopResult.isLoop) {
        const strategy = this.loopDetector.getEscalationStrategy(loopResult);
        logger.warn(`[ReActExecutor] 检测到死循环: ${strategy.reason}`);

        if (onSSEEvent) {
          onSSEEvent({
            type: 'loop_detected',
            reason: strategy.reason,
            action: strategy.action,
          });
        }

        // ask_user → 终止循环请求用户介入
        if (strategy.action === 'ask_user') {
          this.state.shouldTerminate = true;
          this.state.terminateReason = 'loop_detected_ask_user';
          break;
        }
      }
    }

    // 返回最终结果
    this.state.phase = 'done';
    this.state.earlyTermination = this.state.shouldTerminate
      && this.state.terminateReason !== 'task_completed';

    const finalResult = {
      content: finalContent,
      toolCalls: executedToolCalls,
      observations: allObservations,
      totalTurns: this.state.turn,
      earlyTermination: this.state.earlyTermination,
    };

    // 触发任务完成钩子
    await pluginHooks.executeHooks('on_completion', {
      sessionId,
      result: finalResult as unknown as Record<string, unknown>,
    });

    return finalResult;
  }

  // ===================== 阶段方法 =====================

  /**
   * REASONING 阶段：调用 AI 模型获取推理和工具调用。
   *
   * @param currentMessages - 当前消息上下文
   * @param context - 模型调用配置
   * @returns AI 响应（含内容和工具调用）
   */
  private async reasoningPhase(
    currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
    context: {
      modelConfig: ModelCallConfig;
      signal?: AbortSignal;
      onChunk?: (text: string) => void;
      onThinking?: (text: string) => void;
      tools: ReturnType<typeof getBuiltinToolDefinitions>;
      modelCapabilities?: string[];
      sessionId?: string;
    },
  ): Promise<AIResponse> {
    const failoverManager = getModelFailoverManager(this._modelFailoverOptions);
    let currentModelConfig = context.modelConfig;
    let lastError: unknown;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await callAIModelStream(
          currentModelConfig,
          currentMessages,
          (text: string) => {
            if (context.onChunk) context.onChunk(text);
          },
          context.signal,
          context.onThinking,
          context.tools,
          undefined,
          context.modelCapabilities,
        );

        const modelId = (currentModelConfig as unknown as Record<string, unknown>).id as string | undefined;
        if (modelId) {
          failoverManager.recordSuccess(modelId);
        }

        return response;
      } catch (error) {
        lastError = error;
        const modelId = (currentModelConfig as unknown as Record<string, unknown>).id as string | undefined;
        
        if (modelId) {
          let errorCategory: 'auth' | 'rate_limit' | 'network' | 'timeout' | 'server' | 'model_not_supported' | 'unknown' = 'unknown';
          const errMsg = error instanceof Error ? error.message : String(error);
          if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('auth')) {
            errorCategory = 'auth';
          } else if (errMsg.includes('429') || errMsg.includes('rate limit')) {
            errorCategory = 'rate_limit';
          } else if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
            errorCategory = 'timeout';
          } else if (errMsg.includes('network') || errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND')) {
            errorCategory = 'network';
          } else if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('server')) {
            errorCategory = 'server';
          }
          
          failoverManager.recordFailure(modelId, error, errorCategory);
          
          const nextModel = failoverManager.getNextModel(
            modelId,
            errorCategory,
            context.modelCapabilities as string[] | undefined,
          );
          
          if (nextModel) {
            logger.info(
              `[ReActExecutor] 模型故障转移: 从 ${modelId} 切换到 ${nextModel.id} (第 ${attempt + 1} 次尝试)`,
            );
            currentModelConfig = {
              ...currentModelConfig,
              ...(nextModel as unknown as Partial<ModelCallConfig>),
            };
            continue;
          }
        }
        
        break;
      }
    }

    throw lastError;
  }

  /**
   * ACTING 阶段 — 委托给 ActionPhaseExecutor。
   *
   * @param response - AI 响应（含工具调用列表）
   * @param context - 执行上下文（含权限检查、回调等）
   * @returns 工具调用 → 执行结果的映射
   */
  private async actionPhase(
    response: AIResponse,
    context: {
      onToolCall?: (toolCall: ToolCall, result: string) => void;
      executedToolCalls: Array<{ name: string; arguments: string; result: string }>;
      currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
    },
  ): Promise<Map<ToolCall, string>> {
    return this.actionPhaseExecutor.actionPhase(response, context);
  }

  /**
   * OBSERVING 阶段 — 通过 Observer 观察工具执行结果，对超长结果进行轻量压缩。
   *
   * Observer 评估工具执行结果的成败等级（success/warning/error），
   * 供 CircuitBreaker 和 LoopDetector 使用。
   * 超长结果通过 ObservationCompressor 压缩，避免上下文膨胀。
   *
   * @param actionResults - 工具执行结果映射
   * @returns 观察结果列表
   */
  private observationPhase(actionResults: Map<ToolCall, string>): Observation[] {
    const observations: Observation[] = [];

    for (const [toolCall, result] of actionResults) {
      try {
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          // 参数解析失败，使用空对象
        }

        // Observer 评估工具执行结果
        const observation = this.observer.observe(
          { name: toolCall.function.name, arguments: toolArgs },
          result,
        );

        // 对超长结果进行压缩（评估后再压缩，避免影响评估准确性）
        if (needsCompression(result)) {
          const compressed = this.observationCompressor.compress(result);
          observation.result = compressed.compressed;
          observation.metadata = {
            ...observation.metadata,
            wasCompressed: true,
            compressionRatio: compressed.compressionRatio,
          };
        }

        observations.push(observation);
      } catch (observerErr) {
        // Observer 内部错误容忍：视为 success
        logger.error(
          '[ReActExecutor] Observer 错误（已忽略）:',
          observerErr instanceof Error ? observerErr.message : String(observerErr),
        );

        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          // 参数解析失败
        }

        observations.push({
          toolCall: { name: toolCall.function.name, arguments: toolArgs },
          result,
          assessment: {
            level: 'success',
            reason: 'Observer 错误已忽略',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        });
      }
    }

    return observations;
  }

  // ===================== 辅助方法 =====================

  /**
   * 发送 ReAct 阶段切换 SSE 事件。
   *
   * @param onSSEEvent - SSE 事件回调
   * @param phase - 当前阶段
   * @param step - 当前步骤号
   * @param totalSteps - 总步骤数
   * @param description - 阶段描述
   */
  private emitPhase(
    onSSEEvent: ((event: Record<string, unknown>) => void) | undefined,
    phase: ReActPhase,
    step?: number,
    totalSteps?: number,
    description?: string,
  ): void {
    if (!onSSEEvent) return;

    const event: ReActPhaseEvent = {
      type: 'react_phase',
      phase,
      step,
      totalSteps,
      description,
    };

    onSSEEvent(event as unknown as Record<string, unknown>);
  }

  /**
   * 从消息列表中提取最后一条用户消息。
   *
   * @param messages - 消息列表
   * @returns 最后一条用户消息文本，或 null
   */
  private extractUserMessage(
    messages: Array<{ role: string; content: MessageContent }>,
  ): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    }
    return null;
  }
}
