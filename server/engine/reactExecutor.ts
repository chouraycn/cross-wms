/**
 * ReAct 执行器 — 实现 ReAct (Reasoning + Acting) 循环
 *
 * 核心流程：
 * 1. FewShot 模板注入（v5.0 新增）
 * 2. 复杂度评估（v5.0 新增）
 * 3. P1-1: 简单任务跳过 Reasoning，直接走快速路径（v5.1 新增）
 * 4. （可选）Planner 生成执行计划
 * 5. REASONING：调用 AI 模型获取推理和工具调用
 * 6. ACTING：分组并行执行工具调用（v5.0 重构）
 * 7. OBSERVING：Observer 观察结果 + ObservationCompressor 压缩（v5.1 增强：压缩元数据）
 * 8. REFLECTING：反思观察结果，含置信度评分 + 早停 + 自评分（v5.1 增强）
 * 9. 循环直到终止条件满足
 *
 * v5.0 智能终止条件：
 * 1. AI 不调用工具 → 任务完成
 * 2. 连续 3 次同一错误类型 → 终止并报告
 * 3. 达到 maxTurns → 终止并返回已收集结果
 * 4. AbortSignal → 抛出取消错误
 * 5. 预算超限 → budget_exceeded（v5.0 新增）
 * 6. 死循环检测 → replan_triggered / ask_user（v5.0 新增）
 * 7. 高置信度早停 → confidenceScore >= 7 && early_stop（v5.0 新增）
 *
 * v5.1 P1 增强：
 * - P1-1: 简单任务跳过 Reasoning（early return 快速路径）
 * - P1-2: Few-shot 示例注入（v5.0 已集成）
 * - P1-3: Observation 结果压缩增强（wasCompressed + compressionRatio 元数据）
 * - P1-4: 自评分（Self-evaluation A/B/C/D 等级）
 *
 * v5.0.0: ReAct 循环优化
 * v5.1.0: P1 增强功能
 * v6.0.0: P0-1 计划指令注入 + P0-2 工具熔断器 + P0-3 动态复杂度 + P0-4 LLM反思
 *          P1-1 长期记忆 + P1-2 输出校验 + P1-3 自适应预算
 */

import {
  callAIModelStream,
  type AIResponse,
  type ModelCallConfig,
  type ToolCall,
  type MessageContent,
} from '../aiClient.js';
import { Observer, type Observation, type ObserverEvent } from './observer.js';
import { Planner, type ExecutionPlan } from './planner.js';
import { getToolDefinitions, executeToolCall } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName, getMcpServerPrefix } from './mcpTypes.js';
import { truncateContextForModel } from './contextTruncate.js';
import type { ToolExecutionResult } from './toolExecutor.js';
import type { ExecutionStrategyOptions } from './executionStrategy.js';
import { BudgetManager, type BudgetConfig } from './budgetManager.js';
import { LoopDetector } from './loopDetector.js';
import { WorkingMemory } from './workingMemory.js';
import { fewShotTemplates } from './fewShotTemplates.js';
import { ObservationCompressor, needsCompression } from './observationCompressor.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { LongTermMemory } from './longTermMemory.js';
import { OutputValidator } from './outputValidator.js';
import { ToolPermissionSandbox, type PermissionContext, type PermissionDecision } from './toolPermissionSandbox.js';
import { PlanDoCheck, type PDCACheckResult } from './planDoCheck.js';
import { ABTestFramework, type ExperimentVariant, type ExperimentResult } from './abTestFramework.js';
import { ToolDependencyGraph, type ToolCallNode, type TopologyLayer } from './toolDependencyGraph.js';
import { SemanticCompressor, type CompressionResult } from './semanticCompressor.js';
import { MultilingualIntent, type IntentResult } from './multilingualIntent.js';

// ===================== 类型定义 =====================

/** ReAct 循环阶段 */
export type ReActPhase = 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done';

/** 自评分结果（v5.1 新增：P1-4 自评分） */
export interface SelfEvaluation {
  /** 评分等级 */
  grade: 'A' | 'B' | 'C' | 'D';
  /** 评分理由 */
  reason: string;
}

/** ReAct 反思决策（v5.0 增强：新增 confidenceScore + decision，v5.1 新增 selfEvaluation） */
export interface ReActReflectionDecision {
  /** 是否继续循环 */
  shouldContinue: boolean;
  /** 决策原因 */
  reason: string;
  /** 注入到上下文的反思文本（可选） */
  reflectionMessage?: string;
  /** 置信度评分 (1-10)（v5.0 新增） */
  confidenceScore: number;
  /** 决策类型（v5.0 新增） */
  decision: 'continue' | 'early_stop' | 'replan';
  /** 自评分结果（v5.1 新增：P1-4 自评分） */
  selfEvaluation?: SelfEvaluation;
}

/** ReAct 执行结果 — 扩展 ToolExecutionResult */
export interface ReActExecutionResult extends ToolExecutionResult {
  /** 执行计划（可选，当 Planner 触发时存在） */
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
  /** v6.0: P0-1 计划步骤指针 */
  currentStepIndex: number;
  /** v6.0: P2-1 当前复杂度等级（用于权限沙箱上下文） */
  currentComplexityLevel: 'simple' | 'moderate' | 'complex';
  /** v6.0: P2-3 最近一次反思置信度评分 */
  lastConfidenceScore: number;
  /** v6.0: P2-3 是否提前终止 */
  earlyTermination: boolean;
}

/** 复杂度评估结果（内部使用） */
interface ComplexityAssessment {
  level: 'simple' | 'moderate' | 'complex';
  estimatedSteps: number;
  reason: string;
  recommendedMode: string;
}

// ===================== ReActExecutor =====================

/**
 * ReAct 执行器 — 实现完整的 ReAct (Reasoning + Acting) 循环。
 *
 * v5.0 核心增强：
 * - BudgetManager: 预算管理（轮数 + Token 双模）
 * - LoopDetector: 死循环检测 + 升级策略
 * - WorkingMemory: 滑动窗口 + LLM 压缩
 * - FewShotTemplates: 首轮推理增强
 * - ObservationCompressor: 观察结果压缩
 * - 分组并行工具执行
 * - 置信度评分 + 早停
 * - 5 种新 SSE 事件
 */
export class ReActExecutor {
  private observer: Observer;
  private planner?: Planner;
  private state: ReActState;
  private budgetManager: BudgetManager;
  private workingMemory: WorkingMemory;
  private loopDetector: LoopDetector;
  private observationCompressor: ObservationCompressor;
  private circuitBreaker: CircuitBreaker;
  private longTermMemory: LongTermMemory;
  private outputValidator: OutputValidator;
  private permissionSandbox: ToolPermissionSandbox;
  private planDoCheck: PlanDoCheck;
  private abTestFramework: ABTestFramework;
  private dependencyGraph: ToolDependencyGraph;
  private semanticCompressor: SemanticCompressor;
  private multilingualIntent: MultilingualIntent;

  constructor(observer?: Observer, planner?: Planner, budgetConfig?: Partial<BudgetConfig>) {
    this.observer = observer ?? new Observer();
    this.planner = planner;
    this.budgetManager = new BudgetManager(budgetConfig);
    this.workingMemory = new WorkingMemory(budgetConfig?.windowSize);
    this.loopDetector = new LoopDetector();
    this.observationCompressor = new ObservationCompressor();
    this.circuitBreaker = new CircuitBreaker();
    this.longTermMemory = new LongTermMemory();
    this.outputValidator = new OutputValidator();
    this.permissionSandbox = new ToolPermissionSandbox();
    this.planDoCheck = new PlanDoCheck();
    this.abTestFramework = new ABTestFramework();
    this.dependencyGraph = new ToolDependencyGraph();
    this.semanticCompressor = new SemanticCompressor();
    this.multilingualIntent = new MultilingualIntent();
    this.state = this.createInitialState();
  }

  /** 创建初始状态 */
  private createInitialState(): ReActState {
    return {
      phase: 'reasoning',
      turn: 0,
      shouldTerminate: false,
      terminateReason: '',
      currentStepIndex: 0,
      currentComplexityLevel: 'moderate',
      lastConfidenceScore: 0,
      earlyTermination: false,
    };
  }

  /**
   * 执行 ReAct 循环。
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
      onPermissionRequest,
      reasoningEffort,
      modelCapabilities,
      approvedToolsCache,
      onSSEEvent,
    } = options;

    // 重置状态
    this.state = this.createInitialState();
    this.loopDetector.reset();
    this.circuitBreaker.reset();
    this.workingMemory.reset();
    this.outputValidator.reset();
    this.planDoCheck.reset();

    // v6.0: P1-1 会话 ID（用于长期记忆写入）
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // v6.0: P2-3 A/B 测试（选择实验变体）
    const experimentId = 'react_v6_optimization';
    const selectedVariant = this.abTestFramework.selectVariant(experimentId, sessionId);
    const variantName = selectedVariant?.name ?? 'default';
    const executionStartTime = Date.now();

    // 获取工具定义（内置 + 插件 + MCP）
    const builtinTools = getToolDefinitions();
    const pluginTools = pluginRegistry.getActiveTools();
    const mcpTools = mcpClientManager.getMcpTools();
    const tools = [...builtinTools, ...pluginTools, ...mcpTools];

    // 复制消息列表
    const currentMessages = [...messages];
    let finalContent = '';
    const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];
    const allObservations: Observation[] = [];

    // 工具授权缓存
    const approvedTools = approvedToolsCache ?? new Set<string>();

    // 每个工具调用的重试计数器
    const retryCounters = new Map<string, number>();

    // ============== v5.0: FewShot 模板注入 ==============
    const userMessage = this.extractUserMessage(messages);
    if (userMessage) {
      const matchedTemplate = fewShotTemplates.assessTrigger(userMessage);
      if (matchedTemplate) {
        const injected = fewShotTemplates.injectTemplate(currentMessages, matchedTemplate);
        currentMessages.length = 0;
        currentMessages.push(...injected as typeof currentMessages);
        console.log(`[ReActExecutor] FewShot 模板注入: ${matchedTemplate.name}`);
      }
    }

    // ============== v5.0: 复杂度评估 SSE ==============
    let complexityAssessment = this.assessComplexity(messages);
    this.state.currentComplexityLevel = complexityAssessment.level;
    if (onSSEEvent) {
      onSSEEvent({
        type: 'complexity_assessment',
        level: complexityAssessment.level,
        estimatedSteps: complexityAssessment.estimatedSteps,
        reason: complexityAssessment.reason,
        recommendedMode: complexityAssessment.recommendedMode,
      });
    }

    // v6.0: P1-3 自适应预算（按复杂度等级动态调整 maxTurns）
    this.budgetManager.setAdaptiveMaxTurns(complexityAssessment.level, onSSEEvent);

    // v6.0: P1-1 长期记忆检索（Reasoning 前注入历史经验）
    const memoryResult = this.longTermMemory.search(userMessage ?? '', 'default');
    if (memoryResult.entries.length > 0 && memoryResult.totalTokens <= 500) {
      const memoryContext = memoryResult.entries
        .map(e => `[${e.category}] ${e.content}`)
        .join('\n');
      currentMessages.push({
        role: 'system',
        content: `[历史记忆]\n${memoryContext}`,
      } as typeof currentMessages[number]);

      if (onSSEEvent) {
        onSSEEvent({
          type: 'memory_retrieved',
          count: memoryResult.entries.length,
          summaries: memoryResult.entries.map(e => e.content.substring(0, 50)),
        });
      }

      console.log(`[ReActExecutor] 长期记忆注入: ${memoryResult.entries.length} 条, 估算 ${memoryResult.totalTokens} tokens`);
    }

    // ============== P1-1: 简单任务（v6.0: P0-3 支持 handoff） ==============
    // 如果复杂度为 simple，先尝试快速路径；置信度不足时 handoff 到主循环
    if (complexityAssessment.level === 'simple') {
      this.emitPhase(onSSEEvent, 'reasoning', 1, 1, '简单任务：直接响应');

      const simpleResponse = await this.callModelSimple(currentMessages, {
        modelConfig,
        signal,
        onChunk,
        onThinking,
        tools,
        reasoningEffort,
        modelCapabilities,
      });

      let simpleContent = simpleResponse.content || '';
      let needsHandoff = false;

      // 如果 LLM 返回了工具调用，执行一次后评估置信度
      if (simpleResponse.toolCalls && simpleResponse.toolCalls.length > 0) {
        this.emitPhase(onSSEEvent, 'acting', 1, 1, '简单任务：执行工具调用');

        // 添加 assistant 消息（含 tool_calls）
        currentMessages.push({
          role: 'assistant',
          content: simpleResponse.content || '',
          reasoning_content: simpleResponse.reasoningContent,
          tool_calls: simpleResponse.toolCalls.map((tc: ToolCall) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        } as typeof currentMessages[number]);

        // v6.0: P0-3 使用 actionPhase 执行工具（复用熔断器 + 权限检查逻辑）
        const simpleActionResults = await this.actionPhase(simpleResponse, {
          approvedTools,
          onPermissionRequest,
          onToolCall,
          executedToolCalls,
          currentMessages,
        });

        // 将工具结果添加到消息上下文
        for (const [toolCall, result] of simpleActionResults) {
          currentMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          } as typeof currentMessages[number]);
        }

        // v6.0: P0-3 获取观察结果并评估置信度（决定是否 handoff）
        const simpleObservations = this.observationPhase(simpleActionResults);
        allObservations.push(...simpleObservations);

        const simpleDecision = this.reflectionPhase(simpleObservations);

        if (simpleDecision.confidenceScore < 5) {
          // 置信度过低 → handoff 到主循环
          needsHandoff = true;
          complexityAssessment = {
            ...complexityAssessment,
            level: 'moderate',
            estimatedSteps: 3,
            reason: `简单路径置信度过低(${simpleDecision.confidenceScore}/10)，升级为完整 ReAct`,
            recommendedMode: 'react',
          };
          this.state.currentComplexityLevel = 'moderate';

          // 推送 complexity_upgraded SSE
          if (onSSEEvent) {
            onSSEEvent({
              type: 'complexity_upgraded',
              oldLevel: 'simple',
              newLevel: 'moderate',
              reason: `confidenceScore=${simpleDecision.confidenceScore} < 5，handoff到主循环`,
            });
          }

          // 注入反思消息（供主循环首轮使用）
          if (simpleDecision.reflectionMessage) {
            currentMessages.push({
              role: 'system',
              content: simpleDecision.reflectionMessage,
            } as typeof currentMessages[number]);
          }

          console.log(`[ReActExecutor] 简单路径 handoff: confidenceScore=${simpleDecision.confidenceScore}，升级为 moderate`);
        } else {
          // 置信度足够 → 获取最终响应并返回
          this.emitPhase(onSSEEvent, 'reasoning', 1, 1, '简单任务：生成最终响应');
          const finalResponse = await this.callModelSimple(currentMessages, {
            modelConfig,
            signal,
            onChunk,
            onThinking,
            tools: [],  // 不再需要工具调用
            reasoningEffort,
            modelCapabilities,
          });
          simpleContent = finalResponse.content || simpleContent;
        }
      }

      // 如果不需要 handoff，直接返回简单路径结果
      if (!needsHandoff) {
        this.state.phase = 'done';
        this.emitPhase(onSSEEvent, 'done', 1, 1, '简单任务完成');

        return {
          content: simpleContent,
          toolCalls: executedToolCalls,
          observations: allObservations,
          totalTurns: 1,
          earlyTermination: false,
        };
      }
      // needsHandoff = true → 继续执行 Planner + 主循环
      // simple 阶段的 messages/observations/toolCalls 已累积到对应变量中
    }

    // ============== Phase 0：可选规划 ==============
    let plan: ExecutionPlan | undefined;

    if (this.planner) {
      const planUserMessage = this.extractUserMessage(messages);
      if (planUserMessage) {
        const assessment = this.planner.assessTrigger(messages, planUserMessage);
        if (assessment.shouldTrigger) {
          this.emitPhase(onSSEEvent, 'reasoning', undefined, undefined, '正在规划任务...');

          try {
            plan = await this.planner.generatePlan(modelConfig, messages, signal) ?? undefined;
          } catch (planErr) {
            console.error('[ReActExecutor] 规划失败（已忽略）:', planErr instanceof Error ? planErr.message : String(planErr));
          }

          // 推送执行计划
          if (plan && onSSEEvent) {
            onSSEEvent({
              type: 'execution_plan',
              plan: {
                id: plan.id,
                intent: plan.intent,
                steps: plan.steps.map(s => ({
                  step: s.step,
                  description: s.description,
                  toolName: s.toolName,
                  dependsOn: s.dependsOn,
                  status: s.status,
                })),
                isDynamic: plan.isDynamic,
                createdAt: plan.createdAt,
              },
            });
          }
        }
      }
    }

    // ============== 主循环 ==============
    for (let turn = 0; turn < maxToolTurns; turn++) {
      this.state.turn = turn + 1;

      // 检查终止条件
      if (signal?.aborted) {
        throw new Error('请求已取消');
      }
      if (this.state.shouldTerminate) {
        break;
      }

      // ============== v5.0: Budget check ==============
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

      // ============== v5.0: Context truncation with working memory ==============
      const workingMemoryMessages = this.workingMemory.getContextMessages();
      const ctxWindow = (modelConfig as Record<string, unknown>).contextWindow as number || 128000;
      const ctxMaxTokens = modelConfig.maxTokens || 8192;
      const turnTruncated = truncateContextForModel(
        currentMessages,
        ctxWindow,
        ctxMaxTokens,
        tools.length,
        workingMemoryMessages,
      );
      if (turnTruncated.truncated && currentMessages.length !== turnTruncated.messages.length) {
        currentMessages.length = 0;
        currentMessages.push(...turnTruncated.messages as typeof currentMessages);
      }

      // v6.0: P0-1 计划指令注入
      if (plan && this.state.currentStepIndex < plan.steps.length) {
        const currentStep = plan.steps[this.state.currentStepIndex];
        const planDirective = `[执行计划] 当前执行第${currentStep.step}步/${plan.steps.length}步: ${currentStep.description}${currentStep.toolName ? `，推荐工具: ${currentStep.toolName}` : ''}`;
        currentMessages.push({
          role: 'system',
          content: planDirective,
        } as typeof currentMessages[number]);
      }

      // ============== REASONING 阶段 ==============
      this.state.phase = 'reasoning';
      this.emitPhase(onSSEEvent, 'reasoning', turn + 1, maxToolTurns);

      const response = await this.reasoningPhase(currentMessages, {
        modelConfig,
        signal,
        onChunk,
        onThinking,
        tools,
        reasoningEffort,
        modelCapabilities,
        finalContent: '',
      });

      // 累积文本输出
      if (response.content) {
        finalContent += response.content;
        if (!finalContent.endsWith('\n')) {
          finalContent += '\n';
        }
      }

      // v5.0: 累积 Token 使用量
      this.budgetManager.accumulateTokens(undefined, response.content || '');

      // AI 不调用任何工具 → 任务完成
      if (!response.toolCalls || response.toolCalls.length === 0) {
        this.state.shouldTerminate = true;
        this.state.terminateReason = 'task_completed';
        this.state.phase = 'done';
        this.emitPhase(onSSEEvent, 'done', turn + 1, maxToolTurns, '任务完成');
        break;
      }

      // 添加 assistant 消息（含 tool_calls）
      currentMessages.push({
        role: 'assistant',
        content: response.content || '',
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

      // ============== ACTING 阶段（v5.0: 分组并行） ==============
      this.state.phase = 'acting';
      this.emitPhase(onSSEEvent, 'acting', turn + 1, maxToolTurns);

      const actionResults = await this.actionPhase(response, {
        approvedTools,
        onPermissionRequest,
        onToolCall,
        executedToolCalls,
        currentMessages,
      });

      // ============== OBSERVING 阶段（v5.0: 含压缩） ==============
      this.state.phase = 'observing';
      this.emitPhase(onSSEEvent, 'observing', turn + 1, maxToolTurns);

      const observations = this.observationPhase(actionResults);
      allObservations.push(...observations);

      // v6.0: P1-2 结构化输出校验（对 JSON 格式的工具返回结果进行校验和修复）
      for (const obs of observations) {
        // 只校验 JSON 格式的返回结果
        if (obs.result && obs.result.trim().startsWith('{')) {
          const validation = this.outputValidator.validate(obs.toolCall.name, obs.result);

          if (validation.wasRepaired) {
            // 修复成功，用修复后的数据替换观察结果和 actionResults
            const repairedResult = JSON.stringify(validation.data);
            obs.result = repairedResult;
            // 同步更新 actionResults（后续会推送到 currentMessages）
            const matchingToolCall = [...actionResults.keys()].find(
              tc => tc.function.name === obs.toolCall.name,
            );
            if (matchingToolCall) {
              actionResults.set(matchingToolCall, repairedResult);
            }

            if (onSSEEvent) {
              onSSEEvent({
                type: 'output_repaired',
                toolName: obs.toolCall.name,
                repairDetails: validation.repairDetails,
              });
            }
          } else if (!validation.isValid) {
            // 修复失败，附加反思提示
            obs.result = JSON.stringify({
              ...(validation.data as Record<string, unknown>),
              _validation_failed: true,
              _validation_errors: validation.errors,
              _reflection_hint: `返回数据结构异常: ${validation.errors.join('; ')}。建议检查参数或换用其他工具。`,
            });

            // 自动重试（最多 1 次） — 注入反思提示引导下一轮重试
            if (this.outputValidator.canRetry(obs.toolCall.name)) {
              this.outputValidator.recordRetry(obs.toolCall.name);
              currentMessages.push({
                role: 'system',
                content: `[输出校验] 工具 ${obs.toolCall.name} 返回数据结构异常，请调整参数重试。错误: ${validation.errors.join('; ')}`,
              } as typeof currentMessages[number]);
            }
          }
        }
      }

      // 将工具结果添加到消息上下文
      for (const [toolCall, result] of actionResults) {
        currentMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        } as typeof currentMessages[number]);
      }

      // v6.0: P0-1 计划步骤推进（至少一个成功即推进）
      if (plan && this.state.currentStepIndex < plan.steps.length) {
        const hasSuccess = observations.some(o => o.assessment.level === 'success');
        if (hasSuccess) {
          const completedStep = plan.steps[this.state.currentStepIndex];
          this.state.currentStepIndex++;

          // 推送 plan_step_completed SSE
          if (onSSEEvent) {
            onSSEEvent({
              type: 'plan_step_completed',
              planId: plan.id,
              step: completedStep.step,
              description: completedStep.description,
              toolName: completedStep.toolName,
            });
          }

          // 标记步骤状态
          completedStep.status = 'completed';
        } else {
          // 步骤失败，标记
          plan.steps[this.state.currentStepIndex].status = 'failed';
        }
      }

      // ============== REFLECTING 阶段（v5.0: 含置信度 + 早停） ==============
      this.state.phase = 'reflecting';
      this.emitPhase(onSSEEvent, 'reflecting', turn + 1, maxToolTurns);

      const decision = this.reflectionPhase(observations);

      // v6.0: P2-3 更新最近置信度评分
      this.state.lastConfidenceScore = decision.confidenceScore;

      // v5.0: 推送 reflection_confidence SSE 事件（v5.1: 含 selfEvaluation）
      if (onSSEEvent) {
        const sseEvent: Record<string, unknown> = {
          type: 'reflection_confidence',
          confidenceScore: decision.confidenceScore,
          selfScore: decision.confidenceScore,
          shouldEarlyStop: decision.decision === 'early_stop',
          reason: decision.reason,
        };
        // P1-4: 附加自评分信息
        if (decision.selfEvaluation) {
          sseEvent.selfEvaluation = decision.selfEvaluation;
        }
        onSSEEvent(sseEvent);
      }

      // 注入反思消息到上下文
      if (decision.reflectionMessage) {
        currentMessages.push({
          role: 'system',
          content: decision.reflectionMessage,
        } as typeof currentMessages[number]);
      }

      // 推送 observer_reflection SSE 事件（如有反思提示）
      for (const obs of observations) {
        if (obs.assessment.level !== 'success' && obs.reflectionHint) {
          const retryKey = `${obs.toolCall.name}:${JSON.stringify(obs.toolCall.arguments)}`;
          const retryIndex = retryCounters.get(retryKey) ?? 0;

          const observerEvent: ObserverEvent = {
            type: 'observer_reflection',
            toolName: obs.toolCall.name,
            level: obs.assessment.level,
            hint: obs.reflectionHint,
            willRetry: this.observer.shouldRetry(obs, retryIndex),
            retryIndex,
            maxRetries: obs.assessment.maxRetries,
          };

          if (onSSEEvent) {
            onSSEEvent(observerEvent as Record<string, unknown>);
          }
        }
      }

      // 处理重试逻辑
      for (const obs of observations) {
        if (obs.assessment.shouldRetry && obs.reflectionHint) {
          const retryKey = `${obs.toolCall.name}:${JSON.stringify(obs.toolCall.arguments)}`;
          const retryIndex = retryCounters.get(retryKey) ?? 0;

          if (this.observer.shouldRetry(obs, retryIndex)) {
            retryCounters.set(retryKey, retryIndex + 1);

            // 注入反思提示
            const reflectionMsg = `[ReAct 反思] ${obs.reflectionHint}`;
            currentMessages.push({
              role: 'system',
              content: reflectionMsg,
            } as typeof currentMessages[number]);

            console.log(`[ReActExecutor] 工具 ${obs.toolCall.name} 将重试（第 ${retryIndex + 1}/${obs.assessment.maxRetries} 次）`);
          }
        }
      }

      // v6.0: P2-2 PDCA Check（每轮反思后评估计划进度）
      const pdcaResult = this.planDoCheck.check(plan, decision.confidenceScore);
      if (onSSEEvent) {
        onSSEEvent({
          type: 'pdca_check',
          decision: pdcaResult.decision,
          reason: pdcaResult.reason,
          progressPercent: pdcaResult.progressPercent,
          confidence: pdcaResult.confidence,
        });
      }

      // PDCA 决策处理
      if (pdcaResult.decision === 'abort') {
        this.state.shouldTerminate = true;
        this.state.terminateReason = `PDCA 中止: ${pdcaResult.reason}`;
        console.warn(`[ReActExecutor] PDCA 中止: ${pdcaResult.reason}`);
      } else if (pdcaResult.decision === 'adjust' && plan) {
        // 标记失败步骤为 skipped，调整后续步骤
        for (const step of plan.steps) {
          if (step.status === 'failed') {
            step.status = 'skipped';
          }
        }
        if (pdcaResult.adjustmentSuggestion) {
          currentMessages.push({
            role: 'system',
            content: `[PDCA 调整建议] ${pdcaResult.adjustmentSuggestion}`,
          } as typeof currentMessages[number]);
        }
        console.log(`[ReActExecutor] PDCA 调整: ${pdcaResult.reason}`);
      }

      // ============== v5.0: Loop detection ==============
      const loopResult = this.loopDetector.detectLoop(observations, turn);
      if (loopResult.isLoop) {
        const strategy = this.loopDetector.getEscalationStrategy(loopResult);
        console.warn(`[ReActExecutor] 检测到死循环: ${strategy.reason}`);

        if (strategy.action === 'replan' && this.planner && plan) {
          const newPlan = await this.planner.replan(
            modelConfig,
            currentMessages,
            plan,
            strategy.reason,
            signal,
          );

          // v5.0: 推送 replan_triggered SSE 事件
          if (onSSEEvent) {
            onSSEEvent({
              type: 'replan_triggered',
              reason: strategy.reason,
              oldPlanId: plan.id,
              newPlanId: newPlan?.id ?? '',
            });
          }

          if (newPlan) {
            plan = newPlan;
          }
        }

        // ask_user → 终止循环请求用户介入
        if (strategy.action === 'ask_user') {
          this.state.shouldTerminate = true;
          this.state.terminateReason = 'loop_detected_ask_user';
          break;
        }
      }

      // ============== v5.0: Working memory addTurn ==============
      this.workingMemory.addTurn({
        turnIndex: turn,
        observations,
        reflectionDecision: {
          shouldContinue: decision.shouldContinue,
          reason: decision.reason,
          reflectionMessage: decision.reflectionMessage,
        },
        timestamp: Date.now(),
      });

      // ============== v5.0: Planner detectDrift ==============
      if (this.planner) {
        const driftResult = this.planner.detectDrift(currentMessages, plan);
        if (driftResult.hasDrifted) {
          console.warn(`[ReActExecutor] 检测到执行偏离: ${driftResult.reason}`);
        }
      }

      // ============== v5.0: Early stop check ==============
      if (decision.confidenceScore >= 7 && decision.decision === 'early_stop') {
        this.state.shouldTerminate = true;
        this.state.terminateReason = 'early_stop_confident';
        this.state.phase = 'done';
        this.emitPhase(onSSEEvent, 'done', turn + 1, maxToolTurns, '高置信度早停');
        break;
      }

      // 检查终止条件
      if (!decision.shouldContinue) {
        this.state.shouldTerminate = true;
        this.state.terminateReason = decision.reason;
        break;
      }

      // v6.0: P0-2 熔断器 — 替换旧的 shouldTerminateByConsecutiveErrors
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
            console.warn(`[ReActExecutor] 工具 ${obs.toolCall.name} 已熔断，后续轮次将跳过`);
          }
        }
      }

      // v6.0: P0-3 动态复杂度重评估（只升不降，避免抖动）
      if (decision.confidenceScore < 5) {
        const currentLevel = complexityAssessment.level;

        if (currentLevel === 'simple') {
          // simple → moderate 升级
          complexityAssessment = {
            ...complexityAssessment,
            level: 'moderate',
            estimatedSteps: 3,
            reason: `置信度过低(${decision.confidenceScore}/10)，升级为完整 ReAct`,
            recommendedMode: 'react',
          };
          this.state.currentComplexityLevel = 'moderate';

          if (onSSEEvent) {
            onSSEEvent({
              type: 'complexity_upgraded',
              oldLevel: 'simple',
              newLevel: 'moderate',
              reason: `confidenceScore=${decision.confidenceScore} < 5`,
            });
          }

          // v6.0: P1-3 复杂度升级时同步调整预算
          this.budgetManager.setAdaptiveMaxTurns(complexityAssessment.level, onSSEEvent);
        } else if (currentLevel === 'moderate' && decision.confidenceScore < 3) {
          // moderate → complex 升级（连续低置信度）
          complexityAssessment = {
            ...complexityAssessment,
            level: 'complex',
            estimatedSteps: 6,
            reason: `连续低置信度(${decision.confidenceScore}/10)，任务比预期复杂`,
            recommendedMode: 'react',
          };
          this.state.currentComplexityLevel = 'complex';

          if (onSSEEvent) {
            onSSEEvent({
              type: 'complexity_upgraded',
              oldLevel: 'moderate',
              newLevel: 'complex',
              reason: `confidenceScore=${decision.confidenceScore} < 3`,
            });
          }

          // v6.0: P1-3 复杂度升级时同步调整预算
          this.budgetManager.setAdaptiveMaxTurns(complexityAssessment.level, onSSEEvent);
        }
      }

      // v6.0: P1-1 长期记忆写入（低置信度或有重要发现时写入洞察）
      if (decision.confidenceScore < 5 || (observations.some(o => o.assessment.level === 'success') && turn === 0)) {
        const insightParts = observations
          .filter(o => o.assessment.level === 'success' || o.assessment.level === 'error')
          .map(o => `${o.toolCall.name}: ${o.assessment.reason}`);
        const insight = insightParts.join('; ').substring(0, 200);

        if (insight) {
          this.longTermMemory.write({
            userId: 'default',
            sessionId,
            category: decision.confidenceScore < 5 ? 'insight' : 'summary',
            content: insight,
            keywords: (userMessage ?? '').substring(0, 50).toLowerCase(),
          });
        }
      }

      // v6.0: P0-4 LLM 辅助反思（confidenceScore < 5 时触发）
      let llmReflectionInsight: string | null = null;
      if (decision.confidenceScore < 5) {
        llmReflectionInsight = await this.llmReflect(
          observations,
          decision,
          userMessage ?? '',
          modelConfig,
          signal,
        );

        if (llmReflectionInsight && onSSEEvent) {
          onSSEEvent({
            type: 'llm_reflection',
            insight: llmReflectionInsight,
            confidenceScore: decision.confidenceScore,
          });
        }

        if (llmReflectionInsight) {
          currentMessages.push({
            role: 'system',
            content: `[LLM 反思] ${llmReflectionInsight}`,
          } as typeof currentMessages[number]);
        }
      }

      // ============== v6.0: P2-5 语义保留压缩 ==============
      if (this.workingMemory.needsCompression()) {
        const turnCountBefore = this.workingMemory.getTurnCount();

        // 获取需要压缩的旧轮次
        const oldTurns = this.workingMemory.getOldTurnsForCompression();

        if (oldTurns.length > 0) {
          // 收集旧轮次的观察结果
          const oldObservations = oldTurns.flatMap(t => t.observations);
          const existingSummary = this.workingMemory.getSummary();

          // 使用语义压缩替代通用压缩
          const compressionResult = await this.semanticCompressor.compress(
            oldObservations,
            existingSummary,
            modelConfig,
            signal,
          );

          // 更新 workingMemory 的摘要缓存
          this.workingMemory.updateSummaryCache(compressionResult.compressed);
          this.workingMemory.removeCompressedTurns(oldTurns.length);

          const turnCountAfter = this.workingMemory.getTurnCount();
          const compressedTurns = turnCountBefore - turnCountAfter;

          if (onSSEEvent) {
            onSSEEvent({
              type: 'context_compressed',
              compressedTurns,
              summaryLength: compressionResult.compressedLength,
              compressionStrategy: compressionResult.strategy,
              preservedEntities: compressionResult.preservedEntities.slice(0, 5),
            });
          }
        }
      }
    }

    // 返回最终结果
    this.state.phase = 'done';

    // v6.0: P1-1 长期记忆清理（定期修剪 + 关闭连接）
    this.longTermMemory.prune(1000);

    // v6.0: P2-3 更新 earlyTermination 状态
    this.state.earlyTermination = this.state.shouldTerminate && this.state.terminateReason !== 'task_completed';

    // v6.0: P2-3 A/B 测试（记录实验结果）
    this.abTestFramework.recordResult({
      experimentId,
      variantName,
      sessionId,
      metrics: {
        totalTurns: this.state.turn,
        toolCallCount: executedToolCalls.length,
        toolSuccessRate: executedToolCalls.length > 0
          ? executedToolCalls.filter(tc => !tc.result.includes('"error"')).length / executedToolCalls.length
          : 0,
        finalConfidence: this.state.lastConfidenceScore,
        executionTimeMs: Date.now() - executionStartTime,
        earlyTermination: this.state.earlyTermination,
        complexityLevel: complexityAssessment.level,
      },
      timestamp: Date.now(),
    });

    return {
      content: finalContent,
      toolCalls: executedToolCalls,
      plan,
      observations: allObservations,
      totalTurns: this.state.turn,
      earlyTermination: this.state.earlyTermination,
    };
  }

  // ===================== 阶段方法 =====================

  /**
   * REASONING 阶段：调用 AI 模型获取推理和工具调用。
   */
  private async reasoningPhase(
    currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
    context: {
      modelConfig: ModelCallConfig;
      signal?: AbortSignal;
      onChunk?: (text: string) => void;
      onThinking?: (text: string) => void;
      tools: ReturnType<typeof getToolDefinitions>;
      reasoningEffort?: string;
      modelCapabilities?: string[];
      finalContent: string;
    },
  ): Promise<AIResponse> {
    return callAIModelStream(
      context.modelConfig,
      currentMessages,
      (text: string) => {
        if (context.onChunk) context.onChunk(text);
      },
      context.signal,
      context.onThinking,
      context.tools,
      undefined,
      context.reasoningEffort,
      context.modelCapabilities,
    );
  }

  /**
   * P1-1: 简单路径 LLM 调用。
   * 与 reasoningPhase 类似，但独立方法便于日志追踪和未来优化。
   * 不含 finalContent 追踪等复杂逻辑，专用于 simple 复杂度快速路径。
   */
  private async callModelSimple(
    currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
    context: {
      modelConfig: ModelCallConfig;
      signal?: AbortSignal;
      onChunk?: (text: string) => void;
      onThinking?: (text: string) => void;
      tools: ReturnType<typeof getToolDefinitions>;
      reasoningEffort?: string;
      modelCapabilities?: string[];
    },
  ): Promise<AIResponse> {
    return callAIModelStream(
      context.modelConfig,
      currentMessages,
      (text: string) => {
        if (context.onChunk) context.onChunk(text);
      },
      context.signal,
      context.onThinking,
      context.tools,
      undefined,
      context.reasoningEffort,
      context.modelCapabilities,
    );
  }

  /**
   * ACTING 阶段（v5.0 重构：分组并行执行）。
   *
   * 按工具风险等级分组：
   * - auto 组：Promise.all 并行执行（无需权限确认）
   * - confirm 组：串行逐个确认执行
   * - high-risk 组：串行逐个确认执行
   *
   * 返回工具调用和结果的映射。
   */
  private async actionPhase(
    response: AIResponse,
    context: {
      approvedTools: Set<string>;
      onPermissionRequest?: (toolCall: ToolCall) => Promise<boolean>;
      onToolCall?: (toolCall: ToolCall, result: string) => void;
      executedToolCalls: Array<{ name: string; arguments: string; result: string }>;
      currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
    },
  ): Promise<Map<ToolCall, string>> {
    const results = new Map<ToolCall, string>();

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return results;
    }

    const toolCalls = response.toolCalls;

    // v6.0: P2-1 使用 ToolPermissionSandbox 分组
    const permissionContext: PermissionContext = {
      complexityLevel: this.state.currentComplexityLevel,
      currentTurn: this.state.turn,
      executedTools: context.executedToolCalls.map(tc => tc.name),
      userMessage: this.extractUserMessage(context.currentMessages) ?? '',
    };
    const allowGroup = toolCalls.filter(tc => {
      const decision = this.permissionSandbox.getPermission(tc.function.name, permissionContext);
      return decision.permission === 'allow';
    });
    const confirmGroup = toolCalls.filter(tc => {
      const decision = this.permissionSandbox.getPermission(tc.function.name, permissionContext);
      return decision.permission === 'confirm';
    });
    const highRiskGroup = toolCalls.filter(tc => {
      const decision = this.permissionSandbox.getPermission(tc.function.name, permissionContext);
      return decision.permission === 'high-risk';
    });
    const denyGroup = toolCalls.filter(tc => {
      const decision = this.permissionSandbox.getPermission(tc.function.name, permissionContext);
      return decision.permission === 'deny';
    });

    // deny 组：跳过执行，返回禁止结果
    for (const tc of denyGroup) {
      const denyResult = JSON.stringify({ error: `工具 '${tc.function.name}' 已被权限沙箱禁止执行。` });
      results.set(tc, denyResult);
      context.executedToolCalls.push({
        name: tc.function.name,
        arguments: tc.function.arguments,
        result: denyResult,
      });
      if (context.onToolCall) {
        context.onToolCall(tc, denyResult);
      }
    }

    // v6.0: P2-4 构建工具依赖图（仅对 allow 组使用 DAG 优化）
    if (allowGroup.length > 1) {
      this.dependencyGraph.reset();
      allowGroup.forEach((tc, idx) => {
        const decision = this.permissionSandbox.getPermission(tc.function.name, permissionContext);
        this.dependencyGraph.addNode({
          id: `allow_${idx}`,
          toolName: tc.function.name,
          arguments: tc.function.arguments,
          index: idx,
          permission: decision.permission,
        });
      });
      this.dependencyGraph.inferDependencies();
    }

    // v6.0: P2-4 allow 组：按 DAG 拓扑层级执行
    if (allowGroup.length > 0) {
      if (allowGroup.length === 1 || this.dependencyGraph.getEdges().length === 0) {
        // 单个工具或无依赖：直接 Promise.all 并行
        const allowResults = await Promise.all(
          allowGroup.map(async (tc) => {
            const result = await this.executeToolWithPermission(tc, context);
            return { toolCall: tc, result };
          }),
        );
        for (const { toolCall, result } of allowResults) {
          results.set(toolCall, result);
        }
      } else {
        // 多工具有依赖：按拓扑层级执行
        const layers = this.dependencyGraph.topologicalSort();
        for (const layer of layers) {
          if (layer.parallelizable && layer.nodes.length > 1) {
            // 同层可并行
            const layerResults = await Promise.all(
              layer.nodes.map(async (node) => {
                const tc = allowGroup[node.index];
                const result = tc ? await this.executeToolWithPermission(tc, context) : '';
                return { toolCall: tc, result };
              }),
            );
            for (const { toolCall, result } of layerResults) {
              if (toolCall) results.set(toolCall, result);
            }
          } else {
            // 同层串行
            for (const node of layer.nodes) {
              const tc = allowGroup[node.index];
              if (tc) {
                const result = await this.executeToolWithPermission(tc, context);
                results.set(tc, result);
              }
            }
          }
        }
      }
    }

    // confirm 组：串行逐个确认执行
    for (const tc of confirmGroup) {
      const result = await this.executeToolWithPermission(tc, context);
      results.set(tc, result);
    }

    // high-risk 组：串行逐个确认执行
    for (const tc of highRiskGroup) {
      const result = await this.executeToolWithPermission(tc, context);
      results.set(tc, result);
    }

    return results;
  }

  /**
   * 执行单个工具调用（含权限检查）。
   * v5.0 从 actionPhase 中提取为独立方法，支持分组并行。
   */
  private async executeToolWithPermission(
    toolCall: ToolCall,
    context: {
      approvedTools: Set<string>;
      onPermissionRequest?: (toolCall: ToolCall) => Promise<boolean>;
      onToolCall?: (toolCall: ToolCall, result: string) => void;
      executedToolCalls: Array<{ name: string; arguments: string; result: string }>;
    },
  ): Promise<string> {
    const toolName = toolCall.function.name;

    // v6.0: P0-2 熔断检查 — 如果工具已熔断则跳过
    if (this.circuitBreaker.isOpen(toolCall.function.name)) {
      const skipResult = JSON.stringify({
        error: `工具 '${toolCall.function.name}' 已被熔断（连续失败过多），已跳过执行。`,
        circuitBreakerState: 'open',
      });
      context.executedToolCalls.push({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        result: skipResult,
      });
      if (context.onToolCall) {
        context.onToolCall(toolCall, skipResult);
      }
      return skipResult;
    }

    // MCP Server 级熔断检查
    if (isMcpToolName(toolName)) {
      const prefix = getMcpServerPrefix(toolName);
      if (prefix && this.circuitBreaker.isMcpServerOpen(prefix)) {
        const skipResult = JSON.stringify({
          error: `MCP Server '${prefix}' 已被熔断（连续失败过多），已跳过执行。`,
          circuitBreakerState: 'open',
        });
        context.executedToolCalls.push({
          name: toolName,
          arguments: toolCall.function.arguments,
          result: skipResult,
        });
        if (context.onToolCall) {
          context.onToolCall(toolCall, skipResult);
        }
        return skipResult;
      }
    }

    // 权限检查（confirm 和 high-risk 工具需要确认）
    if (this.needsPermission(toolName)) {
      let hasPermission: boolean;

      if (context.approvedTools.has(toolName)) {
        hasPermission = true;
      } else {
        hasPermission = context.onPermissionRequest
          ? await context.onPermissionRequest(toolCall)
          : false;
        if (hasPermission) {
          context.approvedTools.add(toolName);
        }
      }

      if (!hasPermission) {
        const denyResult = JSON.stringify({ error: `用户拒绝了工具 '${toolName}' 的执行请求。` });
        context.executedToolCalls.push({
          name: toolName,
          arguments: toolCall.function.arguments,
          result: denyResult,
        });
        if (context.onToolCall) {
          context.onToolCall(toolCall, denyResult);
        }
        return denyResult;
      }
    }

    // 执行工具（区分 MCP 工具和内置工具）
    let result: string;
    if (isMcpToolName(toolName)) {
      // MCP 工具：委托给 mcpClientManager
      try {
        const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
        result = await mcpClientManager.executeMcpTool(toolName, parsedArgs);
        // 记录 MCP Server 级成功
        const prefix = getMcpServerPrefix(toolName);
        if (prefix) {
          this.circuitBreaker.recordMcpServerSuccess(prefix);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = JSON.stringify({ error: `MCP 工具执行异常: ${errMsg}` });
        // 记录 MCP Server 级失败
        const prefix2 = getMcpServerPrefix(toolName);
        if (prefix2) {
          this.circuitBreaker.recordMcpServerFailure(prefix2, errMsg);
        }
      }
    } else {
      result = await executeToolCall(toolCall);
    }
    context.executedToolCalls.push({
      name: toolName,
      arguments: toolCall.function.arguments,
      result,
    });

    // 通知调用方
    if (context.onToolCall) {
      context.onToolCall(toolCall, result);
    }

    return result;
  }

  /**
   * OBSERVATION 阶段（v5.0: 含 ObservationCompressor 压缩）。
   * 通过 Observer 观察工具执行结果，对超长结果进行压缩。
   * 返回观察结果列表。
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

        // Observer 先用完整结果进行评估
        const observation = this.observer.observe(
          { name: toolCall.function.name, arguments: toolArgs },
          result,
        );

        // v5.0: 对超长结果进行压缩（评估后再压缩，避免影响评估准确性）
        // P1-3: 增强 — 记录压缩元数据（wasCompressed + compressionRatio）
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
        console.error('[ReActExecutor] Observer 错误（已忽略）:', observerErr instanceof Error ? observerErr.message : String(observerErr));
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

  /**
   * REFLECTING 阶段（v5.0 增强：置信度评分 + 早停决策，v5.1 增强：自评分）。
   * 反思观察结果，决定是否继续循环。
   *
   * 置信度评分规则：
   * - allSuccess → confidenceScore=9, decision='early_stop'
   * - allFailed → confidenceScore=2, decision='continue'
   * - 部分 → confidenceScore=6, decision='continue'
   *
   * 早停条件：confidenceScore >= 7 && decision === 'early_stop'
   *
   * P1-4 自评分规则：
   * - A: 任务已完成，结果准确（allSuccess）
   * - B: 任务基本完成，有小瑕疵（部分成功，多数成功）
   * - C: 部分完成，需要继续（部分失败，多数可重试）
   * - D: 执行方向错误，需要调整（allFailed 不可恢复）
   */
  private reflectionPhase(observations: Observation[]): ReActReflectionDecision {
    // 无观察结果 → 继续（不应该发生）
    if (observations.length === 0) {
      return {
        shouldContinue: true,
        reason: '无观察结果',
        confidenceScore: 5,
        decision: 'continue',
        selfEvaluation: { grade: 'C', reason: '无观察结果，无法评估' },
      };
    }

    // 分类观察结果
    const successObs = observations.filter(o => o.assessment.level === 'success');
    const failedObs = observations.filter(o => o.assessment.level === 'error' || o.assessment.level === 'warning');
    const allSuccess = failedObs.length === 0;
    const allFailed = successObs.length === 0;

    // 所有成功：注入简短摘要，高置信度早停
    if (allSuccess) {
      const summaryParts = observations.map(o =>
        `已完成步骤: ${o.toolCall.name} 成功`,
      );
      const summary = summaryParts.join('; ');
      return {
        shouldContinue: true,
        reason: '所有工具执行成功',
        reflectionMessage: `[ReAct 观察] ${summary.length > 200 ? summary.slice(0, 200) : summary}`,
        confidenceScore: 9,
        decision: 'early_stop',
        selfEvaluation: { grade: 'A', reason: '所有工具执行成功，任务已完成' },
      };
    }

    // 全部失败且不可恢复
    if (allFailed) {
      const allUnrecoverable = failedObs.every(
        o => !o.assessment.shouldRetry && !o.assessment.shouldAdjustStrategy,
      );

      if (allUnrecoverable) {
        // 不可恢复 → 终止
        const failureSummary = failedObs
          .map(o => `${o.toolCall.name}: ${o.assessment.reason}`)
          .join('; ');
        return {
          shouldContinue: false,
          reason: `所有工具执行失败且不可恢复: ${failureSummary}`,
          reflectionMessage: `[ReAct 终止] ${failureSummary.length > 200 ? failureSummary.slice(0, 200) : failureSummary}`,
          confidenceScore: 2,
          decision: 'continue',
          selfEvaluation: { grade: 'D', reason: `所有工具执行失败且不可恢复: ${failureSummary.length > 100 ? failureSummary.slice(0, 100) : failureSummary}` },
        };
      }

      // 部分可重试 → 注入反思提示继续
      const hints = failedObs
        .filter(o => o.reflectionHint)
        .map(o => o.reflectionHint!)
        .join('; ');
      return {
        shouldContinue: true,
        reason: '部分失败，尝试重试或调整策略',
        reflectionMessage: hints ? `[ReAct 反思] ${hints.length > 200 ? hints.slice(0, 200) : hints}` : undefined,
        confidenceScore: 2,
        decision: 'continue',
        selfEvaluation: { grade: 'C', reason: '所有工具执行失败，但部分可重试' },
      };
    }

    // 部分失败：注入 Observer 反思提示
    const hints = failedObs
      .filter(o => o.reflectionHint)
      .map(o => o.reflectionHint!)
      .join('; ');

    // P1-4: 自评分 — 部分失败时根据成功比例判断 B 或 C
    const successRatio = successObs.length / observations.length;
    const grade: 'A' | 'B' | 'C' | 'D' = successRatio >= 0.7 ? 'B' : 'C';
    const gradeReason = successRatio >= 0.7
      ? `大部分工具执行成功 (${successObs.length}/${observations.length})，有小瑕疵`
      : `部分工具执行失败 (${failedObs.length}/${observations.length})，需要继续`;

    return {
      shouldContinue: true,
      reason: '部分工具执行失败',
      reflectionMessage: hints ? `[ReAct 反思] ${hints.length > 200 ? hints.slice(0, 200) : hints}` : undefined,
      confidenceScore: 6,
      decision: 'continue',
      selfEvaluation: { grade, reason: gradeReason },
    };
  }

  // ===================== v5.0 辅助方法 =====================

  /**
   * v6.0: P0-4 LLM 辅助反思。
   * confidenceScore < 5 时调用 LLM 进行轻量反思，产出反思提示注入下一轮。
   * LLM 调用失败时静默降级，不阻塞主循环。
   *
   * @param observations - 当前轮观察结果
   * @param decision - 反思决策
   * @param taskDescription - 用户任务描述
   * @param modelConfig - 模型配置（复用主循环的模型）
   * @param signal - 取消信号
   * @returns LLM 反思洞察文本，失败时返回 null
   */
  private async llmReflect(
    observations: Observation[],
    decision: ReActReflectionDecision,
    taskDescription: string,
    modelConfig: ModelCallConfig,
    signal?: AbortSignal,
  ): Promise<string | null> {
    try {
      // 构造精简的反思 prompt（限制观察数量和长度，节省 token）
      const recentObs = observations
        .slice(-2)
        .map(o => `[${o.toolCall.name}] ${o.assessment.reason}`)
        .join('\n');

      const reflectPrompt = `任务: ${taskDescription.slice(0, 200)}
当前进展: 决策=${decision.decision}, 置信度=${decision.confidenceScore}/10
最近观察: ${recentObs.slice(0, 500)}
请用1-2句话指出问题所在和下一步建议。不要重复已知信息。`;

      // 使用低配置调用 LLM（maxTokens=80, temperature=0.3, reasoning_effort=low）
      const reflectConfig: ModelCallConfig = {
        ...modelConfig,
        maxTokens: 80,
        temperature: 0.3,
      };

      const response = await callAIModelStream(
        reflectConfig,
        [{ role: 'user', content: reflectPrompt }],
        () => {},  // 不需要流式输出
        signal,
        undefined,  // onThinking
        undefined,  // tools
        undefined,  // onToolCall
        'low',      // reasoningEffort
      );

      const insight = response.content?.trim() ?? null;
      return insight && insight.length > 0 ? insight : null;
    } catch (err) {
      // LLM 反思失败时静默降级，不阻塞主循环
      console.warn('[ReActExecutor] LLM 反思调用失败，降级为规则引擎:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * 评估消息复杂度（内部方法）。
   * v6.0: P2-6 使用 MultilingualIntent 多语言意图识别
   */
  private assessComplexity(
    messages: Array<{ role: string; content: MessageContent }>,
  ): ComplexityAssessment {
    const toolCallCount = messages.filter(m => m.role === 'tool').length;
    const userMsgText = this.extractUserMessage(messages) || '';

    // v6.0: P2-6 多语言意图识别
    const intent = this.multilingualIntent.recognize(userMsgText);

    // 基于意图 + 工具调用数综合评估
    if (toolCallCount >= 5 || (intent.isMultiStep && intent.estimatedSteps >= 4)) {
      return {
        level: 'complex',
        estimatedSteps: Math.max(intent.estimatedSteps, 6),
        reason: `多步骤复杂任务 (意图: ${intent.primaryIntent}, 语言: ${intent.detectedLanguage})`,
        recommendedMode: 'react',
      };
    }
    if (toolCallCount >= 2 || intent.intents.some(i => ['query', 'analyze', 'compare'].includes(i))) {
      return {
        level: 'moderate',
        estimatedSteps: Math.max(intent.estimatedSteps, 3),
        reason: `中等复杂任务 (意图: ${intent.primaryIntent}, 语言: ${intent.detectedLanguage})`,
        recommendedMode: 'planner',
      };
    }
    return {
      level: 'simple',
      estimatedSteps: intent.estimatedSteps || 1,
      reason: `简单任务 (意图: ${intent.primaryIntent}, 语言: ${intent.detectedLanguage})`,
      recommendedMode: 'observer',
    };
  }

  // ===================== 原有辅助方法 =====================

  /**
   * 判断工具是否需要权限确认。
   * v6.0: P2-1 委托给 ToolPermissionSandbox
   */
  private needsPermission(name: string, context?: PermissionContext): boolean {
    const decision = this.permissionSandbox.getPermission(name, context);
    return decision.needsConfirmation || decision.permission === 'deny';
  }

  /**
   * 发送 ReAct 阶段切换 SSE 事件。
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

    onSSEEvent(event as Record<string, unknown>);
  }

  /**
   * 从消息列表中提取最后一条用户消息。
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

// ===================== P3 接口预留 =====================
// - 长期记忆向量检索：sqlite-vss 替代关键词匹配
// - 结构化输出深度校验：更多 WMS schema + 自定义 schema
// - 工具权限沙箱动态规则热加载
// - PDCA 多轮策略自动调优
