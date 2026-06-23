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
    },
  ): Promise<Map<ToolCall, string>> {
    const results = new Map<ToolCall, string>();

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return results;
    }

    const toolCalls = response.toolCalls;

    // 执行所有工具（Promise.all 并行执行）
    const execResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const result = await this.executeToolWithPermission(tc, context);
        return { toolCall: tc, result };
      }),
    );
    for (const { toolCall, result } of execResults) {
      results.set(toolCall, result);
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
   */
  async executeToolWithPermission(
    toolCall: ToolCall,
    context: {
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
      // v1.5.176: 内置工具执行必须捕获异常，否则 results 会缺失该 tool_call_id
      try {
        result = await executeToolCall(toolCall);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[ReActExecutor] executeToolCall 异常: ${errMsg}`);
        result = JSON.stringify({ error: `工具 '${toolName}' 执行异常: ${errMsg}` });
      }
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
