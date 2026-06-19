/**
 * Execution Strategy — 执行策略框架
 *
 * 提供不同的工具执行策略，支持 Legacy / Observer / ReAct 模式。
 * 通过工厂模式创建策略实例，确保与现有 executeToolLoop 接口兼容。
 *
 * 策略说明：
 * - LegacyStrategy: 直接调用 executeToolLoop，行为与现有完全一致
 * - ObserverStrategy: 增强版工具循环，内嵌 Observer 反思节点
 * - ReactStrategy: ReAct 循环
 */

import {
  executeToolLoop,
  type ToolExecutorOptions,
  type ToolExecutionResult,
  getToolRiskLevel,
} from './toolExecutor.js';
import { Observer, type Observation, type ObserverEvent } from './observer.js';
import { ReActExecutor, type ReActPhaseEvent } from './reactExecutor.js';
import { Planner } from './planner.js';
import { callAIModelStream } from '../aiClient.js';
import type { ModelCallConfig, ToolCall } from '../aiClient.js';
import { getToolDefinitions } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { truncateContextForModel } from './contextTruncate.js';
import { compressContextWithSummary } from './contextCompress.js';
import { executeToolCall } from './toolRegistry.js';
import { type BudgetConfig, DEFAULT_BUDGET_CONFIG } from './budgetManager.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName, getMcpServerPrefix } from './mcpTypes.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { getMergedStrategyPreferences } from './soulLoader.js';
import { logger } from '../logger.js';

// ===================== 执行模式枚举 =====================

/** 执行模式 */
export enum ExecutionMode {
  /** 遗留模式：直接调用 executeToolLoop */
  LEGACY = 'legacy',
  /** 观察者模式：增强版工具循环，内嵌 Observer 反思节点 */
  OBSERVER = 'observer',
  /** ReAct 模式：推理-行动-观察-反思循环 */
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
  private circuitBreaker = new CircuitBreaker();

  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    // 剥离策略相关字段，传递纯 ToolExecutorOptions
    const { executionMode, onSSEEvent, budgetConfig, ...toolOptions } = options;
    return executeToolLoop({
      ...toolOptions,
      circuitBreaker: this.circuitBreaker,
      onSSEEvent,
    });
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
  private circuitBreaker = new CircuitBreaker();

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
    const mcpTools = mcpClientManager.getMcpTools();
    const tools = [...builtinTools, ...pluginTools, ...mcpTools];

    // 复制消息列表
    const currentMessages = [...messages];
    let finalContent = '';
    const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

    // 工具授权缓存
    const approvedTools = approvedToolsCache ?? new Set<string>();

    // 每个工具调用的重试计数器
    const retryCounters = new Map<string, number>();

    // v2.2.1: 工具风险分级（统一使用 toolExecutor 的定义，避免不同步）
    function needsPermission(name: string): boolean {
      const level = getToolRiskLevel(name);
      return level === 'confirm' || level === 'high-risk';
    }

    // ============== 核心循环 ==============
    for (let turn = 0; turn < maxToolTurns; turn++) {
      if (signal?.aborted) {
        throw new Error('请求已取消');
      }

      // 截断上下文防止超限（v1.5.116: 优先智能压缩）
      const ctxWindow = (modelConfig as unknown as Record<string, unknown>).contextWindow as number || 128000;
      // v1.5.131: 截断用 maxTokens 上限 8192，避免 384K 浪费输入空间
      const ctxMaxTokens = Math.min(modelConfig.maxTokens || 8192, 8192);
      const turnTruncated = await compressContextWithSummary(currentMessages, ctxWindow, ctxMaxTokens, tools.length, modelConfig);
      if ((turnTruncated.compressed || turnTruncated.truncated) && currentMessages.length !== turnTruncated.messages.length) {
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

        // v1.5.116: 熔断检查 — 工具已熔断则跳过执行
        if (this.circuitBreaker.isOpen(toolName)) {
          const skipResult = JSON.stringify({
            error: `工具 '${toolName}' 已被熔断（连续失败过多），已跳过执行。`,
            circuitBreakerState: 'open',
          });
          executedToolCalls.push({
            name: toolName,
            arguments: toolCall.function.arguments,
            result: skipResult,
          });
          if (onToolCall) {
            onToolCall(toolCall, skipResult);
          }
          currentMessages.push({
            role: 'tool',
            content: skipResult,
            tool_call_id: toolCall.id,
          } as typeof currentMessages[number]);
          continue;
        }

        // v1.5.116: MCP Server 级熔断检查
        if (isMcpToolName(toolName)) {
          const prefix = getMcpServerPrefix(toolName);
          if (prefix && this.circuitBreaker.isMcpServerOpen(prefix)) {
            const skipResult = JSON.stringify({
              error: `MCP Server '${prefix}' 已被熔断（连续失败过多），已跳过执行。`,
              circuitBreakerState: 'open',
            });
            executedToolCalls.push({
              name: toolName,
              arguments: toolCall.function.arguments,
              result: skipResult,
            });
            if (onToolCall) {
              onToolCall(toolCall, skipResult);
            }
            currentMessages.push({
              role: 'tool',
              content: skipResult,
              tool_call_id: toolCall.id,
            } as typeof currentMessages[number]);
            continue;
          }
        }

        // 执行工具（v1.5.116: 区分 MCP 工具和内置工具）
        let result: string;
        let mcpExecutionSucceeded = true;
        if (isMcpToolName(toolName)) {
          try {
            const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
            result = await mcpClientManager.executeMcpTool(toolName, parsedArgs);
            // MCP Server 级成功记录
            const prefix = getMcpServerPrefix(toolName);
            if (prefix) {
              this.circuitBreaker.recordMcpServerSuccess(prefix);
            }
          } catch (err) {
            mcpExecutionSucceeded = false;
            const errMsg = err instanceof Error ? err.message : String(err);
            result = JSON.stringify({ error: `MCP 工具执行异常: ${errMsg}` });
            // MCP Server 级失败记录
            const prefix = getMcpServerPrefix(toolName);
            if (prefix) {
              const mcpState = this.circuitBreaker.recordMcpServerFailure(prefix, errMsg);
              if (mcpState === 'open' && onSSEEvent) {
                onSSEEvent({
                  type: 'circuit_breaker_triggered',
                  toolName,
                  failureCount: this.circuitBreaker.getRecord(`mcp__${prefix}__*`)?.consecutiveFailures ?? 0,
                  state: 'open',
                });
              }
            }
          }
        } else {
          result = await executeToolCall(toolCall);
        }

        // v1.5.116: 熔断器 — 记录内置工具成功/失败
        if (!isMcpToolName(toolName)) {
          const hasError = result.includes('"error"') || result.includes('"error":');
          if (hasError) {
            const circuitState = this.circuitBreaker.recordFailure(toolName, result.slice(0, 100));
            if (circuitState === 'half_open') {
              const suggestion = this.circuitBreaker.getAlternativeSuggestion(toolName);
              if (suggestion) {
                currentMessages.push({
                  role: 'system',
                  content: `[熔断器] ${suggestion}`,
                } as typeof currentMessages[number]);
              }
            }
            if (circuitState === 'open' && onSSEEvent) {
              const record = this.circuitBreaker.getRecord(toolName);
              onSSEEvent({
                type: 'circuit_breaker_triggered',
                toolName,
                failureCount: record?.consecutiveFailures ?? 0,
                state: 'open',
                alternativeTool: record?.alternativeTool,
              });
            }
          } else {
            this.circuitBreaker.recordSuccess(toolName);
          }
        } else if (!mcpExecutionSucceeded) {
          // MCP 工具级别的熔断记录
          const circuitState = this.circuitBreaker.recordFailure(toolName, result.slice(0, 100));
          if (circuitState === 'half_open') {
            const suggestion = this.circuitBreaker.getAlternativeSuggestion(toolName);
            if (suggestion) {
              currentMessages.push({
                role: 'system',
                content: `[熔断器] ${suggestion}`,
              } as typeof currentMessages[number]);
            }
          }
        } else {
          this.circuitBreaker.recordSuccess(toolName);
        }

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
        // v8.5: 人格联动 — efficient 模式跳过 Observer 反思
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(toolCall.function.arguments); } catch { /* 参数解析失败 */ }

        let observation: Observation;
        if (ExecutionStrategyFactory.getPersonalityObserverFastPath()) {
          // 快速路径：不进行 Observer 反思，直接记录结果
          observation = {
            toolCall: { name: toolName, arguments: toolArgs },
            result,
            assessment: {
              level: 'success',
              reason: '高效模式跳过反思',
              shouldRetry: false,
              shouldAdjustStrategy: false,
              maxRetries: 0,
            },
          };
        } else {
          // 正常路径：执行 Observer 反思
          try {
            observation = this.observer.observe(
              { name: toolName, arguments: toolArgs },
              result,
            );
          } catch (observerErr) {
            // Observer 内部错误不传播
            logger.error('[ObserverStrategy] Observer 错误（已忽略）:', observerErr instanceof Error ? observerErr.message : String(observerErr));
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
            onSSEEvent(observerEvent as unknown as Record<string, unknown>);
          }
        }

        // 添加工具结果到消息上下文
        const toolResultContent = result;

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

          logger.debug(`[ObserverStrategy] 工具 ${toolName} 将重试（第 ${retryIndex + 1}/${observation.assessment.maxRetries} 次），原因：${observation.assessment.reason}`);
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

// ===================== ReactStrategy =====================

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
    // v8.5: 人格联动 — 合并 SOUL.md 的 budget 覆盖
    const personalityBudgetOverride = ExecutionStrategyFactory.getPersonalityBudgetOverride();
    const mergedBudgetConfig = {
      ...personalityBudgetOverride,
      ...options.budgetConfig,  // 显式传入的优先
    };

    const executor = new ReActExecutor(
      ReactStrategy.sharedObserver,
      ReactStrategy.sharedPlanner,
      mergedBudgetConfig,
    );
    try {
      const result = await executor.execute(options);
      return {
        content: result.content,
        toolCalls: result.toolCalls,
      };
    } catch (error) {
      // 降级：ReAct 失败 → Observer → Legacy
      logger.error('[ReActStrategy] 执行失败，降级为 Observer:', error instanceof Error ? error.message : String(error));
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
   * v8.5: 获取人格层影响的预算配置覆盖。
   * 将 SOUL.md 中的 maxTurnsMultiplier 应用到 budgetConfig。
   */
  static getPersonalityBudgetOverride(): Partial<BudgetConfig> {
    const soulPrefs = getMergedStrategyPreferences();
    return {
      maxTurns: Math.round(DEFAULT_BUDGET_CONFIG.maxTurns * soulPrefs.maxTurnsMultiplier),
    };
  }

  /**
   * v8.5: 获取人格层的 Observer 快速路径设置。
   */
  static getPersonalityObserverFastPath(): boolean {
    return getMergedStrategyPreferences().observerFastPath;
  }
}
