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
import { ToolPermissionSandbox, type PermissionContext } from './toolPermissionSandbox.js';
import { ToolDependencyGraph } from './toolDependencyGraph.js';
import { logger } from '../logger.js';

/** 检查工具是否在已授权集合中（支持通配符前缀匹配，如 mcp__server__*） */
export function isToolInApprovedSet(toolName: string, approvedSet: Set<string>): boolean {
  if (approvedSet.has(toolName)) return true;
  for (const pattern of approvedSet) {
    if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/**
 * ActionPhase 执行器 — 封装 ACTING 阶段的全部逻辑。
 *
 * 通过构造函数接收所需依赖（circuitBreaker, permissionSandbox, dependencyGraph 等），
 * 与 ReActExecutor 解耦，便于独立测试和维护。
 */
export class ActionPhaseExecutor {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly permissionSandbox: ToolPermissionSandbox;
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
    permissionSandbox: ToolPermissionSandbox;
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
    this.permissionSandbox = deps.permissionSandbox;
    this.dependencyGraph = deps.dependencyGraph;
    this.extractUserMessage = deps.extractUserMessage;
    this.getState = deps.getState;
  }

  /**
   * 判断工具是否需要权限确认。
   * 委托给 ToolPermissionSandbox。
   */
  needsPermission(name: string, context?: PermissionContext): boolean {
    const decision = this.permissionSandbox.getPermission(name, context);
    return decision.needsConfirmation || decision.permission === 'deny';
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
  async actionPhase(
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
      complexityLevel: this.getState().currentComplexityLevel,
      currentTurn: this.getState().turn,
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
   * 执行单个工具调用（含权限检查）。
   * v5.0 从 actionPhase 中提取为独立方法，支持分组并行。
   */
  async executeToolWithPermission(
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
    if (this.needsPermission(toolName, {
      complexityLevel: this.getState().currentComplexityLevel,
      currentTurn: this.getState().turn,
      executedTools: context.executedToolCalls.map(tc => tc.name),
      userMessage: '',
    })) {
      let hasPermission: boolean;

      if (isToolInApprovedSet(toolName, context.approvedTools)) {
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
