/**
 * ActionPhase 执行器 — 从 ReActExecutor 中提取的 ACTING 阶段逻辑。
 *
 * 职责：
 * 1. actionPhase：分组并行执行工具调用（按权限等级分组：auto/confirm/high-risk/deny）
 * 2. executeToolWithPermission：执行单个工具调用（含熔断检查、权限确认、MCP/内置工具分发）
 * 3. needsPermission：判断工具是否需要权限确认
 * 4. isToolInApprovedSet：检查工具是否在已授权集合中（支持通配符前缀匹配）
 */

import type { AIResponse, ToolCall, MessageContent } from '../aiClient.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName, getMcpServerPrefix } from './mcpTypes.js';
import { executeToolCall } from './toolRegistry.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { ToolDependencyGraph } from './toolDependencyGraph.js';
import { logger } from '../logger.js';
import { executeToolCallWithRetry } from './toolRetryWrapper.js';
import { executeToolCallWithTimeout } from './toolTimeoutWrapper.js';
import { executeToolCallWithMiddleware } from './toolResultMiddleware.js';
import { toolExecutionQueue } from './toolExecutionQueue.js';
import { toolExecutionStats } from './toolExecutionStats.js';
import { toolAuditLog } from './toolAuditLog.js';
import { guardToolResultContext } from './toolContextGuard.js';
import { toolSendReceipts } from './toolSendReceipts.js';
import { abortPrimitives, createRunAbortController } from './abortPrimitives.js';
import { toolFallbackManager } from './toolFallbackStrategy.js';

/**
 * ActionPhase 执行器 — 封装 ACTING 阶段的全部逻辑。
 */
export class ActionPhaseExecutor {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly dependencyGraph: ToolDependencyGraph;
  private readonly extractUserMessage: (
    messages: Array<{ role: string; content: MessageContent }>,
  ) => string | null;
  private readonly getState: () => {
    currentComplexityLevel: 'simple' | 'moderate' | 'complex';
    turn: number;
  };

  constructor(deps: {
    circuitBreaker: CircuitBreaker;
    dependencyGraph: ToolDependencyGraph;
    extractUserMessage: (
      messages: Array<{ role: string; content: MessageContent }>,
    ) => string | null;
    getState: () => {
      currentComplexityLevel: 'simple' | 'moderate' | 'complex';
      turn: number;
    };
  }) {
    this.circuitBreaker = deps.circuitBreaker;
    this.dependencyGraph = deps.dependencyGraph;
    this.extractUserMessage = deps.extractUserMessage;
    this.getState = deps.getState;
  }

  /**
   * ACTING 阶段 — 直接执行所有工具调用。
   */
  async actionPhase(
    response: AIResponse,
    context: {
      onToolCall?: (toolCall: ToolCall, result: string) => void;
      executedToolCalls: Array<{ name: string; arguments: string; result: string }>;
      currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
      /** v11.0 工具调用审计关联会话 ID（可选，未传时审计回退为 'react'） */
      sessionId?: string;
      /** v11.1: 外部 AbortSignal，用于级联取消工具执行 */
      signal?: AbortSignal;
    },
  ): Promise<Map<ToolCall, string>> {
    const results = new Map<ToolCall, string>();

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return results;
    }

    const toolCalls = response.toolCalls;

    // v11.1: 创建 run 级 AbortController 并桥接外部 signal
    const runId = context.sessionId || `react-${Date.now()}`;
    const runController = createRunAbortController(runId);
    const managedSignal = runController.signal;
    if (context.signal) {
      context.signal.addEventListener('abort', () => {
        abortPrimitives.abort(`run:${runId}`, {
          reason: 'cascaded',
          source: 'external',
          timestamp: Date.now(),
          message: 'External signal aborted',
        });
      });
    }

    try {
      // 执行所有工具（Promise.all 并行执行）
      const execResults = await Promise.all(
        toolCalls.map(async (tc) => {
          const result = await this.executeToolWithPermission(tc, context, managedSignal);
          return { toolCall: tc, result };
        }),
      );
      for (const { toolCall, result } of execResults) {
        results.set(toolCall, result);
      }
    } finally {
      abortPrimitives.release(`run:${runId}`);
    }

    // v1.5.176: 完整性校验 — 确保所有 tool_call_id 都有对应结果
    // OpenAI 规范：assistant(tool_calls) 后必须有每个 tool_call_id 的 tool 消息
    for (const tc of toolCalls) {
      if (!results.has(tc)) {
        logger.error(`[ReActExecutor] tool_call_id=${tc.id} (${tc.function.name}) 缺少执行结果，自动补全错误消息`);
        const errorResult = JSON.stringify({
          error: `工具 '${tc.function.name}' 执行失败：结果缺失，可能原因：权限拒绝未返回结果、工具执行器异常未捕获`,
          tool_call_id: tc.id,
        });
        results.set(tc, errorResult);
      }
    }

    return results;
  }

  /**
   * 执行单个工具调用。
   * v11.1: 增加 managedSignal 参数，用于将 run 级别的 AbortController 信号传递给队列
   */
  async executeToolWithPermission(
    toolCall: ToolCall,
    context: {
      onToolCall?: (toolCall: ToolCall, result: string) => void;
      executedToolCalls: Array<{ name: string; arguments: string; result: string }>;
      /** P1-2: 实际消息数组，用于工具结果上下文累积保护 guardToolResultContext */
      currentMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
      /** v11.0 工具调用审计关联会话 ID（可选，未传时审计回退为 'react'） */
      sessionId?: string;
    },
    managedSignal?: AbortSignal,
  ): Promise<string> {
    const toolName = toolCall.function.name;

    // v11.1: 检查 run 级别是否已取消
    if (managedSignal?.aborted) {
      const abortResult = JSON.stringify({
        error: `工具 '${toolName}' 执行已取消（run 已 abort）`,
        aborted: true,
      });
      context.executedToolCalls.push({
        name: toolName,
        arguments: toolCall.function.arguments,
        result: abortResult,
      });
      if (context.onToolCall) {
        context.onToolCall(toolCall, abortResult);
      }
      return abortResult;
    }

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

    // v11.1: 统一通过稳定性执行链（retry → queue → timeout → executor → middleware）
    // v11.1: 降级检查 — 若主工具健康分过低，切换到备用工具
    const effectiveToolName = toolFallbackManager.checkAndFallback(toolName);

    // 创建工具发送回执
    toolSendReceipts.createReceipt({
      id: toolCall.id,
      toolName: effectiveToolName,
      sessionId: context.sessionId || 'react',
      arguments: toolCall.function.arguments,
    });

    let result: string;
    const execStartTime = Date.now();
    let retryCount = 0;
    let timedOut = false;

    const toolExecutor = async (toolSignal: AbortSignal): Promise<string> => {
      if (isMcpToolName(effectiveToolName)) {
        const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
        const mcpResult = await mcpClientManager.executeMcpTool(effectiveToolName, parsedArgs, { signal: toolSignal });
        const prefix = getMcpServerPrefix(effectiveToolName);
        if (prefix) {
          this.circuitBreaker.recordMcpServerSuccess(prefix);
        }
        return mcpResult;
      } else {
        return executeToolCall({
          ...toolCall,
          function: { ...toolCall.function, name: effectiveToolName },
        });
      }
    };

    try {
      const retryResult = await executeToolCallWithRetry(effectiveToolName, () =>
        toolExecutionQueue.enqueue(
          {
            id: toolCall.id,
            toolName: effectiveToolName,
            args: JSON.parse(toolCall.function.arguments || '{}'),
            priority: 'normal',
            sessionId: context.sessionId,
            enqueuedAt: Date.now(),
            signal: managedSignal,
          },
          (queueSignal: AbortSignal) =>
            executeToolCallWithTimeout(effectiveToolName, toolExecutor, { signal: queueSignal }),
        ),
        {}, managedSignal,
      );
      result = retryResult.result;
      retryCount = retryResult.retryCount;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : undefined;
      timedOut = errName === 'ToolTimeoutError';

      result = JSON.stringify({
        error: `工具执行异常: ${errMsg}`,
        errorName: errName,
        timedOut,
      });

      if (isMcpToolName(effectiveToolName)) {
        const prefix = getMcpServerPrefix(effectiveToolName);
        if (prefix) {
          this.circuitBreaker.recordMcpServerFailure(prefix, errMsg);
        }
      }
    }

    // 结果中间件：截断 + 错误分类
    const middlewareResult = executeToolCallWithMiddleware(effectiveToolName, result);
    result = middlewareResult.content;

    // P1-2 修复：传入实际消息数组，使上下文累积保护生效
      result = guardToolResultContext(result, context.currentMessages as any[], 128000);

    // 统计记录（使用 effectiveToolName，让健康分跟踪实际执行的工具）
    toolExecutionStats.record({
      toolName: effectiveToolName,
      startTime: execStartTime,
      endTime: Date.now(),
      success: middlewareResult.errorType === 'none',
      errorType: middlewareResult.errorType === 'none' ? undefined : middlewareResult.errorType,
      errorMessage: middlewareResult.errorMessage,
      retryCount,
      timedOut,
      resultSize: result.length,
    });

    // 审计日志（记录原始工具名和实际执行的工具名，便于追踪降级）
    toolAuditLog.log({
      toolName: effectiveToolName,
      originalToolName: effectiveToolName !== toolName ? toolName : undefined,
      sessionId: context.sessionId,
      args: JSON.parse(toolCall.function.arguments || '{}'),
      result: result.slice(0, 500),
      success: middlewareResult.errorType === 'none',
      durationMs: Date.now() - execStartTime,
      errorType: middlewareResult.errorType === 'none' ? undefined : middlewareResult.errorType,
      truncated: middlewareResult.truncated,
    });

    // 完成/失败工具发送回执
    if (middlewareResult.errorType === 'none') {
      toolSendReceipts.completeReceipt(toolCall.id, result, retryCount);
    } else {
      toolSendReceipts.failReceipt(toolCall.id, middlewareResult.errorMessage || 'Unknown error', retryCount);
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
}
