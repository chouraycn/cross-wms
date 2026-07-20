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
import { Planner, type ExecutionPlan, type PlanStepStatus } from './planner.js';
import { getBuiltinToolDefinitions } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { mcpClientManager } from './mcpClientManager.js';
import { compressContextWithSummary } from './contextCompress.js';
import { truncateContextForModel, estimateMessagesTokens, type ApiMessage } from './contextTruncate.js';
import type { ToolExecutionResult } from './toolExecutor.js';
import type { ExecutionStrategyOptions } from './executionStrategy.js';
import { BudgetManager, type BudgetConfig } from './budgetManager.js';
import { LoopDetector } from './loopDetector.js';
import { ObservationCompressor, needsCompression } from './observationCompressor.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { ToolDependencyGraph } from './toolDependencyGraph.js';
import { ActionPhaseExecutor } from './actionPhaseExecutor.js';
import { AutoCompressor } from './autoCompressor.js';
import { getModelFailoverManager, type ModelFailoverOptions, ensureFailoverModelsLoaded } from './modelFailover.js';
import { getBackoffCoordinator, type CoordinateInput } from './backoffCoordinator.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import { loadModelsConfig, type ModelsFile, type ModelConfig } from '../modelsStore.js';
import type { ModelCapability } from '../modelsStore.js';
import pluginHooks from './pluginHooks.js';
import { logger } from '../logger.js';
import { batchCreateTodos, updateTodo, findTodosBySession } from '../dao/taskMonitorDao.js';
import { publishTodoCreated, publishTodoUpdated, publishPlanCreated, publishPlanUpdated, publishPlanRevised } from './taskMonitorEvents.js';

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
  /** 执行计划（v9.1 [五]: 启用 planningMode 时由 Planner 生成，否则 undefined） */
  plan?: ExecutionPlan;
  /** v9.1 [一]: 执行轨迹（每轮 thought/observation 摘要） */
  scratchpad?: ScratchpadEntry[];
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

/** v9.1 [五]: 计划导航 system 消息前缀（用于重规划时定位并更新） */
const PLAN_NAV_PREFIX = '[执行计划导航]';

/** v9.1 [一]: 单轮执行轨迹（写入 scratchpad，供压缩/重规划复用，不污染 messages） */
export interface ScratchpadEntry {
  /** 轮次（1-based） */
  turn: number;
  /** 本轮推理摘要（截断） */
  thought?: string;
  /** 本轮观察摘要（截断） */
  observation?: string;
  /** 本轮使用的工具名 */
  toolsUsed: string[];
  /** 耗时（ms） */
  durationMs: number;
  /** 估算 token 消耗 */
  tokensUsed: number;
  /** 关联的计划步骤（若有） */
  planStep?: number;
}

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
  /** v9.1 [一]: 执行轨迹（每轮 thought/observation 摘要） */
  private _scratchpad?: ScratchpadEntry[];
  /** v9.1 [五]: 当前激活的执行计划 */
  private _activePlan?: ExecutionPlan;

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
   * v9.1 [五]: 将执行计划格式化为 system 导航消息（注入上下文，作为 turn 导航）
   */
  private buildPlanNavigation(plan: ExecutionPlan): string {
    const stepsText = plan.steps
      .map(s => `  ${s.step}. [${s.status}] ${s.description}${s.toolName ? ` (推荐工具: ${s.toolName})` : ''}`)
      .join('\n');
    return `${PLAN_NAV_PREFIX}
你正在按以下计划执行任务，请逐步推进，完成后在最终回复中说明各步骤结果：
意图：${plan.intent}
步骤：
${stepsText}`;
  }

  /**
   * v9.2: 根据工具名查找对应的计划步骤索引
   * 匹配规则：步骤的 toolName 与工具名匹配，且状态为 pending 或 in_progress
   */
  private findPlanStepIndex(toolName: string): number {
    if (!this._activePlan) return -1;
    const idx = this._activePlan.steps.findIndex(
      s => s.toolName === toolName && (s.status === 'pending' || s.status === 'in_progress'),
    );
    return idx;
  }

  /**
   * v9.2: 更新计划步骤状态
   */
  private updatePlanStepStatus(toolName: string, status: PlanStepStatus): void {
    if (!this._activePlan) return;
    const step = this._activePlan.steps.find(
      s => s.toolName === toolName && (s.status === 'pending' || s.status === 'in_progress'),
    );
    if (step) {
      step.status = status;
    }
  }

  /**
   * v9.3: 将执行计划同步到任务监控待办
   * 将计划步骤转换为待办项，供前端侧边栏实时展示
   */
  private async syncPlanToTodos(plan: ExecutionPlan, sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    try {
      const todos = plan.steps.map((step) => ({
        sessionId,
        text: step.description,
        source: 'auto' as const,
        priority: step.toolName ? 'high' as const : 'normal' as const,
      }));
      
      const created = batchCreateTodos(todos);
      for (const todo of created) {
        publishTodoCreated(sessionId, todo);
      }
      
      logger.debug(`[ReActExecutor] 计划 ${plan.id} 已同步到待办，共 ${created.length} 项`);
    } catch (err) {
      logger.warn('[ReActExecutor] 同步计划到待办失败:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * v9.3: 更新待办状态（根据计划步骤状态）
   */
  private async updateTodoStatusByStep(step: number, status: PlanStepStatus, sessionId: string | undefined): Promise<void> {
    if (!sessionId || !this._activePlan) return;
    try {
      const planStep = this._activePlan.steps.find(s => s.step === step);
      if (!planStep) return;

      const todos = findTodosBySession(sessionId);
      const todo = todos.find(t => t.text === planStep.description);
      if (todo) {
        const newStatus = status === 'completed' ? 'done' : status === 'failed' ? 'done' : 'in_progress';
        const updated = updateTodo(todo.id, { status: newStatus });
        publishTodoUpdated(sessionId, updated);
        logger.debug(`[ReActExecutor] 步骤 ${step} 待办状态已更新为 ${newStatus}`);
      }
    } catch (err) {
      logger.warn('[ReActExecutor] 更新待办状态失败:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * v9.3: 确保工具调用有对应的待办（无计划模式下动态创建）
   * 如果待办已存在则返回，不存在则创建
   */
  private async ensureTodoForToolCall(
    toolName: string,
    toolArgs: string,
    sessionId: string | undefined,
    initialStatus: 'pending' | 'in_progress' = 'in_progress',
  ): Promise<void> {
    if (!sessionId) return;
    try {
      const todos = findTodosBySession(sessionId);
      const todoText = this.buildTodoTextFromTool(toolName, toolArgs);
      const existing = todos.find(t => t.text === todoText);
      
      if (existing) {
        if (existing.status !== initialStatus) {
          updateTodo(existing.id, { status: initialStatus });
        }
        return;
      }
      
      batchCreateTodos([{
        sessionId,
        text: todoText,
        source: 'auto',
        priority: 'high',
        status: initialStatus,
      }]);
      
      logger.debug(`[ReActExecutor] 为工具调用 ${toolName} 创建待办: ${todoText}`);
    } catch (err) {
      logger.warn('[ReActExecutor] 创建工具待办失败:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * v9.3: 根据工具调用生成待办描述文本
   */
  private buildTodoTextFromTool(toolName: string, toolArgs: string): string {
    try {
      const args = JSON.parse(toolArgs || '{}');
      switch (toolName) {
        case 'web_search':
        case 'web_search_legacy':
          return `搜索: ${args.query || '未知查询'}`;
        case 'web_fetch':
        case 'fetch':
          return `读取网页: ${args.url || '未知URL'}`;
        case 'browser_navigate':
          return `浏览器访问: ${args.url || '未知URL'}`;
        case 'browser_click':
        case 'browser_type':
        case 'browser_snapshot':
          return `浏览器操作: ${toolName}`;
        case 'code_search':
        case 'grep_search':
          return `代码搜索: ${args.pattern || '未知模式'}`;
        case 'read_file':
          return `读取文件: ${args.file_path || args.path || '未知文件'}`;
        case 'write_file':
          return `写入文件: ${args.file_path || args.path || '未知文件'}`;
        case 'run_command':
          return `执行命令: ${args.command || '未知命令'}`;
        default:
          const argSummary = Object.values(args)
            .filter(v => typeof v === 'string' && v.length > 0)
            .slice(0, 2)
            .join(', ');
          return `执行工具: ${toolName}${argSummary ? ' - ' + argSummary : ''}`;
      }
    } catch {
      return `执行工具: ${toolName}`;
    }
  }

  /**
   * v9.3: 根据工具名更新待办状态（无计划模式下）
   */
  private async updateTodoStatusByToolName(
    toolName: string,
    toolArgs: string,
    status: 'completed' | 'failed',
    sessionId: string | undefined,
  ): Promise<void> {
    if (!sessionId) return;
    try {
      const todos = findTodosBySession(sessionId);
      const todoText = this.buildTodoTextFromTool(toolName, toolArgs);
      const todo = todos.find(t => t.text === todoText);
      if (todo) {
        const newStatus = 'done';
        updateTodo(todo.id, { status: newStatus });
        logger.debug(`[ReActExecutor] 工具 ${toolName} 待办状态已更新为 ${newStatus}`);
      }
    } catch (err) {
      logger.warn('[ReActExecutor] 更新工具待办状态失败:', err instanceof Error ? err.message : String(err));
    }
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
      onPlan,
      planningMode = 'off',
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
    // v9.1 [一]: 重置执行轨迹
    this._scratchpad = [];

    // 获取工具定义（内置 + 插件 + MCP）
    const builtinTools = getBuiltinToolDefinitions();
    const pluginTools = pluginRegistry.getActiveTools();
    const mcpTools = mcpClientManager.getMcpTools();
    const tools = [...builtinTools, ...pluginTools, ...mcpTools];

    // 复制消息列表
    const currentMessages = [...messages];

    // v9.1 [五]: 规划模式 — 复杂任务先生成计划作为导航，注入 system 消息
    this._activePlan = undefined;
    if (planningMode !== 'off' && this._planner) {
      try {
        const userMsg = this.extractUserMessage(currentMessages) || '';
        const assessment = this._planner.assessTrigger(currentMessages, userMsg);
        if (assessment.shouldTrigger) {
          const plan = await this._planner.generatePlan(modelConfig, currentMessages, signal);
          if (plan) {
            this._activePlan = plan;
            const planPrompt = this.buildPlanNavigation(plan);
            currentMessages.unshift({ role: 'system', content: planPrompt } as typeof currentMessages[number]);
            if (onSSEEvent) onSSEEvent({ type: 'plan', plan: plan as unknown as Record<string, unknown> });
            onPlan?.(plan as unknown as Record<string, unknown>);
            logger.debug(`[ReActExecutor] 已生成执行计划 ${plan.id} (${plan.steps.length} 步)`);
            // v9.3: WebSocket 推送计划创建事件
            if (sessionId) {
              publishPlanCreated(sessionId, plan);
            }
            this.syncPlanToTodos(plan, sessionId).catch(err => {
              logger.warn('[ReActExecutor] 同步计划到待办失败:', err);
            });
          }
        }
      } catch (planErr) {
        logger.warn('[ReActExecutor] 规划生成失败，跳过:', planErr instanceof Error ? planErr.message : String(planErr));
      }
    }
    let finalContent = '';
    const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];
    const allObservations: Observation[] = [];

    // ============== 3 步循环：推理 → 执行 → 观察 ==============
    for (let turn = 0; turn < maxToolTurns; turn++) {
      this.state.turn = turn + 1;
      const turnStart = Date.now();

      // 检查终止条件
      if (signal?.aborted) {
        const err = new Error('请求已取消');
        err.name = 'AbortError';
        throw err;
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

      // v9.3: 工具开始执行时，更新对应待办状态为 in_progress
      if (sessionId && response.toolCalls && response.toolCalls.length > 0) {
        if (this._activePlan) {
          // 有计划模式：根据计划步骤更新待办
          for (const tc of response.toolCalls) {
            const stepIdx = this.findPlanStepIndex(tc.function.name);
            if (stepIdx >= 0) {
              this.updatePlanStepStatus(tc.function.name, 'in_progress');
              this.updateTodoStatusByStep(stepIdx + 1, 'in_progress', sessionId).catch(err => {
                logger.warn('[ReActExecutor] 更新待办状态为进行中失败:', err);
              });
            }
          }
        } else {
          // 无计划模式：为每个工具调用动态创建待办
          for (const tc of response.toolCalls) {
            this.ensureTodoForToolCall(tc.function.name, tc.function.arguments, sessionId, 'in_progress').catch(err => {
              logger.warn('[ReActExecutor] 创建工具待办失败:', err);
            });
          }
        }
      }

      const actionResults = await this.actionPhase(response, {
        onToolCall,
        executedToolCalls,
        currentMessages,
        sessionId,
        messageId: options.messageId,
        signal,
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

      // v9.1 [一]: 写入执行轨迹 + 发送 turn_trace 事件（供可观测性与压缩复用）
      const turnDuration = Date.now() - turnStart;
      const turnTokens = this.budgetManager.getConsumedTokens();
      const toolsUsed = actionResults ? Array.from(actionResults.keys()).map(tc => tc.function.name) : [];
      const obsSummary = observations
        .map(o => (o.assessment.level === 'success' ? '✓' : '✗') + (o.assessment.reason || ''))
        .join('; ')
        .slice(0, 200);
      if (this._scratchpad) {
        this._scratchpad.push({
          turn: turn + 1,
          thought: (response.reasoningContent || '').slice(0, 300),
          observation: obsSummary,
          toolsUsed,
          durationMs: turnDuration,
          tokensUsed: turnTokens,
        });
      }
      if (onSSEEvent) {
        onSSEEvent({
          type: 'turn_trace',
          turn: turn + 1,
          tools: toolsUsed,
          durationMs: turnDuration,
          tokensUsed: turnTokens,
          planStep: this._activePlan ? Math.min(turn + 1, this._activePlan.steps.length) : undefined,
        });
      }

      // ============== Circuit Breaker — 记录成功/失败 ==============
      for (const obs of observations) {
        if (obs.assessment.level === 'success') {
          this.circuitBreaker.recordSuccess(obs.toolCall.name);
          // v9.2: 步骤状态跟踪 — 工具成功时标记对应计划步骤为 completed
          if (sessionId) {
            if (this._activePlan) {
              const stepIdx = this.findPlanStepIndex(obs.toolCall.name);
              this.updatePlanStepStatus(obs.toolCall.name, 'completed');
              if (stepIdx >= 0) {
                this.updateTodoStatusByStep(stepIdx + 1, 'completed', sessionId).catch(err => {
                  logger.warn('[ReActExecutor] 更新待办状态失败:', err);
                });
              }
            } else {
              // 无计划模式：更新工具待办为完成
              const argsStr = typeof obs.toolCall.arguments === 'string' 
                ? obs.toolCall.arguments 
                : JSON.stringify(obs.toolCall.arguments);
              this.updateTodoStatusByToolName(obs.toolCall.name, argsStr, 'completed', sessionId).catch(err => {
                logger.warn('[ReActExecutor] 更新工具待办状态失败:', err);
              });
            }
          }
        } else {
          // v9.3: 工具失败时，更新对应待办状态
          if (sessionId) {
            if (this._activePlan) {
              const stepIdx = this.findPlanStepIndex(obs.toolCall.name);
              this.updatePlanStepStatus(obs.toolCall.name, 'failed');
              if (stepIdx >= 0) {
                this.updateTodoStatusByStep(stepIdx + 1, 'failed', sessionId).catch(err => {
                  logger.warn('[ReActExecutor] 更新待办状态为失败:', err);
                });
              }
            } else {
              // 无计划模式：更新工具待办为完成（失败也标记为 done）
              const argsStr = typeof obs.toolCall.arguments === 'string' 
                ? obs.toolCall.arguments 
                : JSON.stringify(obs.toolCall.arguments);
              this.updateTodoStatusByToolName(obs.toolCall.name, argsStr, 'failed', sessionId).catch(err => {
                logger.warn('[ReActExecutor] 更新工具待办状态为失败:', err);
              });
            }
          }

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

      // v9.2: 规则式动态调整 — 工具失败时调用 adjustPlan 插入恢复步骤
      if (this._activePlan && this._planner) {
        const failedObs = observations.find(o => o.assessment.level !== 'success');
        if (failedObs) {
          const stepIdx = this.findPlanStepIndex(failedObs.toolCall.name);
          if (stepIdx >= 0) {
            try {
              const adjusted = this._planner.adjustPlan(this._activePlan, {
                failedStepIndex: stepIdx,
                error: failedObs.assessment.reason || 'unknown error',
                toolName: failedObs.toolCall.name,
              });
              this._activePlan = adjusted;
              if (onSSEEvent) onSSEEvent({ type: 'plan_revised', plan: adjusted as unknown as Record<string, unknown> });
              // v9.3: WebSocket 推送计划修订事件
              if (sessionId) {
                publishPlanRevised(sessionId, adjusted);
              }
              logger.debug(`[ReActExecutor] adjustPlan: 步骤 ${stepIdx + 1} 失败，已插入恢复步骤`);
            } catch (adjErr) {
              logger.warn('[ReActExecutor] adjustPlan 失败:', adjErr instanceof Error ? adjErr.message : String(adjErr));
            }
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

        // v9.1 [五]: 动态规划模式 — 循环/失败时反思式重规划
        // v9.2: 仅当 LoopDetector 建议 replan 或更高时才触发 LLM 重规划
        if (planningMode === 'dynamic' && this._activePlan && this._planner
            && (strategy.action === 'replan' || strategy.action === 'ask_user')) {
          try {
            const scratchpadSummary = (this._scratchpad || [])
              .map(e => `轮${e.turn}: 工具[${e.toolsUsed.join(',')}] 观察:${e.observation}`)
              .join('\n');
            const userMsg = this.extractUserMessage(currentMessages) || '';
            const revised = await this._planner.reflectionReplan(
              modelConfig, userMsg, this._activePlan, scratchpadSummary, signal,
            );
            if (revised) {
              this._activePlan = revised;
              // 更新计划导航 system 消息（定位前缀后替换，避免重复注入）
              const navIdx = currentMessages.findIndex(
                m => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(PLAN_NAV_PREFIX),
              );
              if (navIdx >= 0) {
                currentMessages[navIdx] = { ...currentMessages[navIdx], content: this.buildPlanNavigation(revised) };
              }
              if (onSSEEvent) onSSEEvent({ type: 'plan_revised', plan: revised as unknown as Record<string, unknown> });
              onPlan?.(revised as unknown as Record<string, unknown>);
              publishPlanRevised(sessionId || '', revised as unknown as Record<string, unknown>);
              logger.debug(`[ReActExecutor] 反思式重规划完成，${revised.steps.length} 步`);
            }
          } catch (replanErr) {
            logger.warn('[ReActExecutor] 反思式重规划失败，继续:', replanErr instanceof Error ? replanErr.message : String(replanErr));
          }
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
      plan: this._activePlan,
      scratchpad: this._scratchpad,
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
    // v2.x: 统一通过 BackoffCoordinator 编排故障转移，覆盖 keyRotator（同模型多 Key 轮换）
    // 与 modelFailover（跨模型降级）两层。原实现直接调用 callAIModelStream 并手写错误分类，
    // 绕过了 keyRotator，导致用户配置的多 API Key 在 ReAct 推理中失效。
    const coordinator = getBackoffCoordinator();
    const failoverManager = getModelFailoverManager(this._modelFailoverOptions);

    // 确保模型列表已加载（从 modelsStore 懒加载，修复 failover 不生效的 bug）
    await ensureFailoverModelsLoaded();
    // BackoffCoordinator.coordinate 需要 modelsConfig 来解析备选模型名称
    let modelsConfig: ModelsFile | undefined;
    try {
      modelsConfig = await loadModelsConfig({ skipKeyInjection: true });
      failoverManager.setModels(modelsConfig.models);
    } catch {
      // 降级：无 modelsConfig 时仍可工作，但无法做跨模型降级
    }

    // 初始 Key 选择：优先从 keyRotator 选健康 Key（支持同模型多 Key 轮询）
    let currentModelConfig = context.modelConfig;
    let currentModelId = (currentModelConfig as unknown as { id?: string }).id as string | undefined;
    let currentKeyIndex = -1;
    if (currentModelId) {
      const modelConfig = modelsConfig?.models.find((m) => m.id === currentModelId);
      if (modelConfig) {
        const selected = selectKey(modelConfig);
        if (selected) {
          currentModelConfig = { ...currentModelConfig, apiKey: selected.key };
          currentKeyIndex = selected.index;
        }
      }
    }

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

        if (currentModelId) {
          coordinator.recordSuccess(currentModelId, currentKeyIndex);
        }

        return response;
      } catch (error) {
        lastError = error;

        if (!currentModelId) break;

        // 查找当前模型的完整配置（含 apiKeys，供 keyRotator 决策）
        const fullModelConfig = modelsConfig?.models.find((m) => m.id === currentModelId);
        if (!fullModelConfig) break;

        const coordinateInput: CoordinateInput = {
          modelId: currentModelId,
          modelConfig: fullModelConfig,
          keyIndex: currentKeyIndex,
          error,
          modelsConfig,
          requiredCapabilities: context.modelCapabilities as ModelCapability[] | undefined,
        };

        const decision = coordinator.coordinate(coordinateInput);

        if (decision.action === 'give-up') {
          logger.info(
            `[ReActExecutor] 故障转移放弃: ${decision.reason} (模型 ${currentModelId})`,
          );
          break;
        }

        if (decision.action === 'rotate-key' && decision.apiKey !== undefined) {
          logger.info(
            `[ReActExecutor] 同模型轮换 Key: 模型 ${currentModelId} → Key#${decision.keyIndex} (第 ${attempt + 1} 次尝试)`,
          );
          currentModelConfig = { ...currentModelConfig, apiKey: decision.apiKey };
          currentKeyIndex = decision.keyIndex ?? -1;
          continue;
        }

        if (decision.action === 'switch-model' && decision.nextModelId) {
          const nextModel = modelsConfig?.models.find((m) => m.id === decision.nextModelId);
          if (!nextModel) {
            logger.warn(`[ReActExecutor] 备选模型 ${decision.nextModelId} 未找到，放弃故障转移`);
            break;
          }
          logger.info(
            `[ReActExecutor] 跨模型降级: ${currentModelId} → ${decision.nextModelId} (第 ${attempt + 1} 次尝试, 原因: ${decision.reason})`,
          );
          // 切换到新模型，重新选 Key
          currentModelConfig = { ...currentModelConfig, ...(nextModel as unknown as Partial<ModelCallConfig>) };
          currentModelId = nextModel.id;
          const selected = selectKey(nextModel);
          if (selected) {
            currentModelConfig = { ...currentModelConfig, apiKey: selected.key };
            currentKeyIndex = selected.index;
          } else {
            currentKeyIndex = -1;
          }
          continue;
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
      /** v11.0 工具调用审计关联会话 ID（可选，未传时审计回退为 'react'） */
      sessionId?: string;
      /** v11.2: 助手消息 ID，用于 task_monitor 工具调用持久化 */
      messageId?: string;
      /** v11.1: 外部 AbortSignal，传递给 actionPhaseExecutor */
      signal?: AbortSignal;
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
  private extractUserMessage(messages: ApiMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        if (content == null) return null;
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    }
    return null;
  }
}
