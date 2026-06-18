/**
 * Execution Strategy — 执行策略框架
 *
 * 提供不同的工具执行策略，支持 Legacy / Observer / Planner / ReAct 模式。
 * 通过工厂模式创建策略实例，确保与现有 executeToolLoop 接口兼容。
 *
 * 策略说明：
 * - LegacyStrategy: 直接调用 executeToolLoop，行为与现有完全一致
 * - ObserverStrategy: 增强版工具循环，内嵌 Observer 反思节点
 * - PlannerStrategy / ReActStrategy: T02+ 实现
 *
 * v5.0.0: ReAct 循环优化 — 新增 budgetConfig + assessComplexity
 */

import {
  executeToolLoop,
  type ToolExecutorOptions,
  type ToolExecutionResult,
} from './toolExecutor.js';
import { Observer, type Observation, type ObserverEvent } from './observer.js';
import { Planner, type ExecutionPlan, type PlanStep } from './planner.js';
import { ReActExecutor, type ReActPhaseEvent } from './reactExecutor.js';
import { callAIModelStream } from '../aiClient.js';
import type { ModelCallConfig, ToolCall, MessageContent } from '../aiClient.js';
import { getToolDefinitions } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { truncateContextForModel } from './contextTruncate.js';
import { executeToolCall } from './toolRegistry.js';
import { type BudgetConfig } from './budgetManager.js';

// ===================== 执行模式枚举 =====================

/** 执行模式 */
export enum ExecutionMode {
  /** 遗留模式：直接调用 executeToolLoop */
  LEGACY = 'legacy',
  /** 观察者模式：增强版工具循环，内嵌 Observer 反思节点 */
  OBSERVER = 'observer',
  /** 计划器模式：T02 实现 */
  PLANNER = 'planner',
  /** ReAct 模式：T02 实现 */
  REACT = 'react',
}

// ===================== 策略选项 =====================

/** 执行策略选项，扩展 ToolExecutorOptions */
export interface ExecutionStrategyOptions extends ToolExecutorOptions {
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** SSE 事件回调（用于推送 observer_reflection 等事件） */
  onSSEEvent?: (event: Record<string, unknown>) => void;
  /** v5.0: 预算配置（传递给 ReActExecutor） */
  budgetConfig?: Partial<BudgetConfig>;
}

// ===================== 复杂度评估 =====================

/** 复杂度评估结果 */
export interface ComplexityAssessment {
  /** 复杂度等级 */
  level: 'simple' | 'moderate' | 'complex';
  /** 估计步骤数 */
  estimatedSteps: number;
  /** 评估原因 */
  reason: string;
  /** 推荐执行模式 */
  recommendedMode: string;
}

// ===================== 策略接口 =====================

/** 执行策略接口 */
export interface IExecutionStrategy {
  /** 执行工具循环 */
  execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult>;
}

// ===================== LegacyStrategy =====================

/**
 * 遗留策略 — 直接调用 executeToolLoop，行为与现有完全一致。
 * 向后兼容，无任何额外逻辑。
 */
export class LegacyStrategy implements IExecutionStrategy {
  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    // 剥离策略相关字段，传递纯 ToolExecutorOptions
    const { executionMode, onSSEEvent, budgetConfig, ...toolOptions } = options;
    return executeToolLoop(toolOptions);
  }
}

// ===================== ObserverStrategy =====================

/**
 * 观察者策略 — 增强版工具循环，内嵌 Observer 反思节点。
 *
 * 核心流程（复刻 executeToolLoop 逻辑 + Observer 注入）：
 * 1. 调用 AI 模型（含 tools 定义）
 * 2. 检测 tool_calls
 * 3. 执行工具 → observer.observe() → 生成观察评估
 * 4. 当 shouldRetry 时：注入反思 system 消息 → 重新进入循环
 * 5. 通过 onSSEEvent 回调发送 observer_reflection 事件
 * 6. 其他逻辑与原 executeToolLoop 一致
 */
export class ObserverStrategy implements IExecutionStrategy {
  private observer: Observer;

  constructor(observer?: Observer) {
    this.observer = observer ?? new Observer();
  }

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
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

    // 获取工具定义
    const builtinTools = getToolDefinitions();
    const pluginTools = pluginRegistry.getActiveTools();
    const tools = [...builtinTools, ...pluginTools];

    // 复制消息列表
    const currentMessages = [...messages];
    let finalContent = '';
    const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

    // 工具授权缓存
    const approvedTools = approvedToolsCache ?? new Set<string>();

    // 每个工具调用的重试计数器
    const retryCounters = new Map<string, number>();

    // v2.2.1: 工具风险分级（复用 toolExecutor 逻辑）
    const TOOL_RISK_LEVELS: Record<string, string> = {
      'system_info': 'auto', 'file_listDir': 'auto', 'file_readFile': 'auto',
      'db_query': 'auto', 'desktop_health': 'auto', 'desktop_screenshot': 'auto',
      'app_setBotName': 'auto', 'wms_inventory': 'auto', 'web_search': 'auto',
      'web_fetch': 'auto', 'file_writeFile': 'confirm', 'shell_exec': 'confirm',
      'web_api_call': 'confirm', 'browser_navigate': 'confirm', 'browser_click': 'confirm',
      'browser_type': 'confirm', 'desktop_click': 'high-risk', 'desktop_type': 'high-risk',
      'desktop_key_press': 'high-risk', 'desktop_app_launch': 'auto',
      'desktop_app_quit': 'high-risk', 'desktop_window_focus': 'high-risk',
      'desktop_clipboard': 'high-risk', 'desktop_scroll': 'high-risk',
      'desktop_see': 'high-risk', 'browser_snapshot': 'auto', 'browser_screenshot': 'auto',
      'web_hook_listen': 'confirm', 'web_hook_poll': 'auto', 'web_hook_stop': 'auto',
    };

    function getToolRiskLevel(name: string): string {
      return TOOL_RISK_LEVELS[name] || 'confirm';
    }

    function needsPermission(name: string): boolean {
      const level = getToolRiskLevel(name);
      return level === 'confirm' || level === 'high-risk';
    }

    // ============== 核心循环 ==============
    for (let turn = 0; turn < maxToolTurns; turn++) {
      if (signal?.aborted) {
        throw new Error('请求已取消');
      }

      // 截断上下文防止超限
      const ctxWindow = (modelConfig as Record<string, unknown>).contextWindow as number || 128000;
      const ctxMaxTokens = modelConfig.maxTokens || 8192;
      const turnTruncated = truncateContextForModel(currentMessages, ctxWindow, ctxMaxTokens, tools.length);
      if (turnTruncated.truncated && currentMessages.length !== turnTruncated.messages.length) {
        currentMessages.length = 0;
        currentMessages.push(...turnTruncated.messages as typeof currentMessages);
      }

      // 调用 AI 模型
      const response = await callAIModelStream(
        modelConfig,
        currentMessages,
        (text: string) => {
          if (onChunk) onChunk(text);
          finalContent += text;
        },
        signal,
        onThinking,
        tools,
        undefined,
        reasoningEffort,
        modelCapabilities,
      );

      // 无 tool_calls，直接返回
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return { content: response.content || finalContent, toolCalls: executedToolCalls };
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

      // 执行每个 tool call
      for (const toolCall of response.toolCalls) {
        const toolName = toolCall.function.name;

        // 权限检查
        if (needsPermission(toolName)) {
          let hasPermission: boolean;

          if (approvedTools.has(toolName)) {
            hasPermission = true;
          } else {
            hasPermission = onPermissionRequest
              ? await onPermissionRequest(toolCall)
              : false;
            if (hasPermission) {
              approvedTools.add(toolName);
            }
          }

          if (!hasPermission) {
            const denyResult = JSON.stringify({ error: `用户拒绝了工具 '${toolName}' 的执行请求。` });
            executedToolCalls.push({
              name: toolName,
              arguments: toolCall.function.arguments,
              result: denyResult,
            });
            if (onToolCall) {
              onToolCall(toolCall, denyResult);
            }
            currentMessages.push({
              role: 'tool',
              content: denyResult,
              tool_call_id: toolCall.id,
            } as typeof currentMessages[number]);
            continue;
          }
        }

        // 执行工具
        const result = await executeToolCall(toolCall);

        // 记录工具调用
        executedToolCalls.push({
          name: toolName,
          arguments: toolCall.function.arguments,
          result,
        });

        // 通知调用方
        if (onToolCall) {
          onToolCall(toolCall, result);
        }

        // ============== Observer 节点 ==============
        let observation: Observation;
        try {
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            // 参数解析失败，使用空对象
          }

          observation = this.observer.observe(
            { name: toolName, arguments: toolArgs },
            result,
          );
        } catch (observerErr) {
          // Observer 内部错误不传播
          console.error('[ObserverStrategy] Observer 错误（已忽略）:', observerErr instanceof Error ? observerErr.message : String(observerErr));
          observation = {
            toolCall: { name: toolName, arguments: {} },
            result,
            assessment: {
              level: 'success',
              reason: 'Observer 错误已忽略',
              shouldRetry: false,
              shouldAdjustStrategy: false,
              maxRetries: 0,
            },
          };
        }

        // 获取重试计数
        const retryKey = `${toolName}:${toolCall.function.arguments}`;
        const retryIndex = retryCounters.get(retryKey) ?? 0;

        // 判断是否应该重试
        const shouldRetry = this.observer.shouldRetry(observation, retryIndex);

        // 发送 observer_reflection SSE 事件
        if (observation.assessment.level !== 'success' && observation.reflectionHint) {
          const observerEvent: ObserverEvent = {
            type: 'observer_reflection',
            toolName,
            level: observation.assessment.level,
            hint: observation.reflectionHint,
            willRetry: shouldRetry,
            retryIndex,
            maxRetries: observation.assessment.maxRetries,
          };

          // 通过 onSSEEvent 回调发送
          if (onSSEEvent) {
            onSSEEvent(observerEvent as Record<string, unknown>);
          }
        }

        // 添加工具结果到消息上下文
        let toolResultContent = result;

        // 当 shouldRetry 时：注入反思 system 消息
        if (shouldRetry && observation.reflectionHint) {
          // 更新重试计数
          retryCounters.set(retryKey, retryIndex + 1);

          // 构建反思注入消息
          const reflectionSystemMsg = {
            role: 'system' as const,
            content: `[反思提示] ${observation.reflectionHint}${observation.assessment.shouldAdjustStrategy && observation.assessment.strategyHint ? `\n策略建议：${observation.assessment.strategyHint}` : ''}`,
          };

          // 先添加工具结果
          currentMessages.push({
            role: 'tool',
            content: toolResultContent,
            tool_call_id: toolCall.id,
          } as typeof currentMessages[number]);

          // 注入反思提示
          currentMessages.push(reflectionSystemMsg as typeof currentMessages[number]);

          console.log(`[ObserverStrategy] 工具 ${toolName} 将重试（第 ${retryIndex + 1}/${observation.assessment.maxRetries} 次），原因：${observation.assessment.reason}`);
        } else {
          // 不重试，正常添加工具结果
          currentMessages.push({
            role: 'tool',
            content: toolResultContent,
            tool_call_id: toolCall.id,
          } as typeof currentMessages[number]);
        }
      }

      // 累积文本输出
      if (finalContent && !finalContent.endsWith('\n')) {
        finalContent += '\n\n';
      }
    }

    // 达到最大轮数
    return { content: finalContent, toolCalls: executedToolCalls };
  }
}

// ===================== PlannerStrategy =====================

/**
 * 计划器策略 — 评估复杂任务并生成结构化执行计划。
 *
 * 核心流程：
 * 1. 提取用户消息
 * 2. 调用 planner.assessTrigger() 判断是否需要规划
 * 3. 不触发 → 委托给 ObserverStrategy
 * 4. 触发 → 调用 planner.generatePlan()，失败则降级为 Observer
 * 5. 生成计划成功 → 通过 SSE 推送 execution_plan 事件
 * 6. 按步骤顺序执行：将步骤描述注入 messages，然后调用 ObserverStrategy
 * 7. 每步完成后更新 plan.step.status，推送 SSE 更新
 * 8. 步骤失败且 plan.isDynamic → 调用 planner.adjustPlan()
 * 9. 返回 ToolExecutionResult
 */
export class PlannerStrategy implements IExecutionStrategy {
  private planner: Planner;
  private observerStrategy: ObserverStrategy;

  constructor(planner?: Planner, observerStrategy?: ObserverStrategy) {
    this.planner = planner ?? new Planner();
    this.observerStrategy = observerStrategy ?? new ObserverStrategy();
  }

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    const {
      modelConfig,
      messages,
      signal,
      onSSEEvent,
    } = options;

    // 1. 提取用户消息
    const userMessage = this.extractUserMessage(messages);
    if (!userMessage) {
      // 无法提取用户消息，降级为 Observer
      console.log('[PlannerStrategy] 无法提取用户消息，降级为 Observer');
      return this.observerStrategy.execute(options);
    }

    // 2. 评估是否触发 Planner
    const assessment = this.planner.assessTrigger(messages, userMessage);
    console.log(`[PlannerStrategy] assessTrigger: shouldTrigger=${assessment.shouldTrigger}, reason=${assessment.reason}`);

    // 3. 不触发 → 委托给 ObserverStrategy
    if (!assessment.shouldTrigger) {
      return this.observerStrategy.execute(options);
    }

    // 4. 触发 → 调用 LLM 生成计划
    let plan: ExecutionPlan | null = null;
    try {
      plan = await this.planner.generatePlan(modelConfig, messages, signal);
    } catch (planErr) {
      console.error('[PlannerStrategy] generatePlan 失败:', planErr instanceof Error ? planErr.message : String(planErr));
    }

    // 生成计划失败 → 降级为 Observer
    if (!plan) {
      console.log('[PlannerStrategy] 计划生成失败，降级为 Observer');
      return this.observerStrategy.execute(options);
    }

    console.log(`[PlannerStrategy] 计划生成成功: intent="${plan.intent}", steps=${plan.steps.length}`);

    // 5. 生成计划成功 → 推送 execution_plan SSE 事件
    if (onSSEEvent) {
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

    // 6. 按步骤顺序执行
    let finalContent = '';
    const allExecutedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

    for (let stepIdx = 0; stepIdx < plan.steps.length; stepIdx++) {
      const currentStep = plan.steps[stepIdx];

      // 跳过已完成的步骤
      if (currentStep.status === 'completed' || currentStep.status === 'skipped') {
        continue;
      }

      // 跳过依赖未完成的步骤
      const unmetDeps = currentStep.dependsOn.filter(
        depStep => plan.steps.find(s => s.step === depStep && s.status !== 'completed'),
      );
      if (unmetDeps.length > 0) {
        currentStep.status = 'skipped';
        if (onSSEEvent) {
          onSSEEvent({
            type: 'plan_step_update',
            planId: plan.id,
            step: currentStep.step,
            status: 'skipped',
            reason: `依赖步骤 ${unmetDeps.join(', ')} 未完成`,
          });
        }
        continue;
      }

      // 标记步骤为 in_progress
      currentStep.status = 'in_progress';
      if (onSSEEvent) {
        onSSEEvent({
          type: 'plan_step_update',
          planId: plan.id,
          step: currentStep.step,
          status: 'in_progress',
        });
      }

      // 将当前步骤描述注入到 messages 中作为 system 提示
      const stepSystemMessage = {
        role: 'system' as const,
        content: `[执行计划] 当前步骤 ${currentStep.step}/${plan.steps.length}: ${currentStep.description}${currentStep.toolName ? `\n推荐工具: ${currentStep.toolName}` : ''}`,
      };

      // 构造带步骤注入的消息列表
      const stepMessages = [...messages, stepSystemMessage];

      // 构造 ObserverStrategy 的执行选项
      const stepOptions: ExecutionStrategyOptions = {
        ...options,
        messages: stepMessages,
      };

      // 调用 ObserverStrategy 执行当前步骤
      let stepResult: ToolExecutionResult;
      try {
        stepResult = await this.observerStrategy.execute(stepOptions);
      } catch (stepErr) {
        // 执行失败
        const errorMsg = stepErr instanceof Error ? stepErr.message : String(stepErr);
        console.error(`[PlannerStrategy] 步骤 ${currentStep.step} 执行失败:`, errorMsg);

        currentStep.status = 'failed';

        // 推送失败更新
        if (onSSEEvent) {
          onSSEEvent({
            type: 'plan_step_update',
            planId: plan.id,
            step: currentStep.step,
            status: 'failed',
            error: errorMsg,
          });
        }

        // 动态重规划
        if (plan.isDynamic) {
          const adjustedPlan = this.planner.adjustPlan(plan, {
            failedStepIndex: stepIdx,
            error: errorMsg,
            toolName: currentStep.toolName,
          });

          // 如果调整后产生了新步骤，推送更新
          if (adjustedPlan.steps.length > plan.steps.length) {
            plan = adjustedPlan;
            if (onSSEEvent) {
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

        // 继续执行后续步骤（非致命错误不中断整个计划）
        continue;
      }

      // 步骤执行成功
      currentStep.status = 'completed';
      finalContent += (finalContent && !finalContent.endsWith('\n') ? '\n\n' : '') + stepResult.content;
      allExecutedToolCalls.push(...stepResult.toolCalls);

      // 推送步骤完成更新
      if (onSSEEvent) {
        onSSEEvent({
          type: 'plan_step_update',
          planId: plan.id,
          step: currentStep.step,
          status: 'completed',
        });
      }

      console.log(`[PlannerStrategy] 步骤 ${currentStep.step}/${plan.steps.length} 完成`);
    }

    // 推送计划完成事件
    if (onSSEEvent) {
      onSSEEvent({
        type: 'plan_step_update',
        planId: plan.id,
        step: 0, // 0 表示整体计划
        status: 'completed',
        summary: {
          total: plan.steps.length,
          completed: plan.steps.filter(s => s.status === 'completed').length,
          failed: plan.steps.filter(s => s.status === 'failed').length,
          skipped: plan.steps.filter(s => s.status === 'skipped').length,
        },
      });
    }

    // 9. 返回最终结果
    return {
      content: finalContent,
      toolCalls: allExecutedToolCalls,
    };
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

// ===================== ReActStrategy =====================

/**
 * ReAct 策略 — 实现 ReAct (Reasoning + Acting) 循环。
 *
 * 使用 ReActExecutor 执行完整的推理-行动-观察-反思循环。
 * 失败时降级为 ObserverStrategy。
 */
export class ReactStrategy implements IExecutionStrategy {
  // 复用 Observer/Planner 实例，避免每次请求重新创建
  private static sharedObserver: Observer | null = null;
  private static sharedPlanner: Planner | null = null;

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    // 懒加载共享实例
    if (!ReactStrategy.sharedObserver) {
      ReactStrategy.sharedObserver = new Observer();
    }
    if (!ReactStrategy.sharedPlanner) {
      ReactStrategy.sharedPlanner = new Planner();
    }
    const executor = new ReActExecutor(
      ReactStrategy.sharedObserver,
      ReactStrategy.sharedPlanner,
      options.budgetConfig,
    );
    try {
      const result = await executor.execute(options);
      return {
        content: result.content,
        toolCalls: result.toolCalls,
      };
    } catch (error) {
      // 降级：ReAct 失败 → Observer → Legacy
      console.error('[ReActStrategy] 执行失败，降级为 Observer:', error instanceof Error ? error.message : String(error));
      return new ObserverStrategy().execute(options);
    }
  }
}

// ===================== 工厂 =====================

/**
 * 执行策略工厂 — 根据模式创建对应的策略实例。
 */
export class ExecutionStrategyFactory {
  /**
   * 根据执行模式创建策略实例。
   */
  static create(mode: ExecutionMode): IExecutionStrategy {
    switch (mode) {
      case ExecutionMode.LEGACY:
        return new LegacyStrategy();
      case ExecutionMode.OBSERVER:
        return new ObserverStrategy();
      case ExecutionMode.PLANNER:
        return new PlannerStrategy();
      case ExecutionMode.REACT:
        return new ReactStrategy();
      default:
        return new LegacyStrategy();
    }
  }

  /**
   * 获取默认执行模式。
   */
  static getDefaultMode(): ExecutionMode {
    return ExecutionMode.LEGACY;
  }

  /**
   * 评估消息复杂度（v5.0 新增）。
   * 根据工具调用数量和用户消息关键词判断复杂度等级。
   *
   * @param messages - 消息列表
   * @returns 复杂度评估结果
   */
  static assessComplexity(messages: Array<{ role: string; content: unknown }>): ComplexityAssessment {
    const toolCallCount = messages.filter(m => m.role === 'tool').length;

    let userText = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        userText = typeof content === 'string' ? content : JSON.stringify(content);
        break;
      }
    }

    if (toolCallCount >= 5 || /先.*再.*然后/.test(userText)) {
      return { level: 'complex', estimatedSteps: 6, reason: '多步骤复杂任务', recommendedMode: 'react' };
    }
    if (toolCallCount >= 2 || /查询|分析/.test(userText)) {
      return { level: 'moderate', estimatedSteps: 3, reason: '中等复杂任务', recommendedMode: 'planner' };
    }
    return { level: 'simple', estimatedSteps: 1, reason: '简单任务', recommendedMode: 'observer' };
  }
}
