/**
 * 统一工具执行器 — 参考 OpenClaw tools/execution.ts
 *
 * 基于 ToolExecutorRef 路由工具调用到正确的执行后端：
 * - core: 通过现有 toolRegistry.executeToolCall 执行
 * - plugin: 通过 pluginRegistry 执行
 * - channel: 通过通道插件执行
 * - mcp: 通过 mcpClientManager 执行
 *
 * 支持超时、重试、错误分类和安全检查。
 */

import { logger } from '../../logger.js';
import { executeToolCall } from '../toolRegistry.js';
import type { ToolCall } from '../../aiClient.js';
import { mcpClientManager } from '../mcpClientManager.js';
import type { ToolExecutorRef, ToolPlanEntry } from './types.js';
import { scanContent } from './security-filter.js';

/** 工具执行请求 */
export interface ToolExecutionRequest {
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  parameters: Record<string, unknown>;
  /** 执行器引用 */
  executor: ToolExecutorRef;
  /** 会话 ID */
  sessionId?: string;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 是否跳过安全检查 */
  skipSecurityCheck?: boolean;
}

/** 工具执行结果 */
export interface ToolExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 结果内容 */
  content: string;
  /** 执行时长（毫秒） */
  durationMs: number;
  /** 错误信息（如果失败） */
  error?: string;
  /** 安全警告 */
  securityWarnings?: string[];
}

/** 执行器函数类型 */
type ExecutorFn = (request: ToolExecutionRequest) => Promise<string>;

/** 执行器注册表 */
const executorRegistry = new Map<string, ExecutorFn>();

/**
 * 注册自定义执行器
 *
 * @param executorKey - 执行器键
 * @param fn - 执行函数
 */
export function registerCustomExecutor(executorKey: string, fn: ExecutorFn): void {
  executorRegistry.set(executorKey, fn);
  logger.debug(`[ToolExecutor] 注册自定义执行器: ${executorKey}`);
}

/**
 * 执行工具调用
 *
 * @param request - 执行请求
 * @returns 执行结果
 */
export async function executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const { toolName, parameters, executor, sessionId } = request;

  logger.debug(`[ToolExecutor] 执行工具: ${toolName}, executor=${executor.kind}`);

  // 安全检查（输入）
  if (!request.skipSecurityCheck) {
    const inputScan = scanContent(JSON.stringify(parameters), {
      toolName,
      inputSource: 'user',
      sessionId,
    });
    if (!inputScan.passed && inputScan.overallRisk === 'critical') {
      return {
        success: false,
        content: '',
        durationMs: Date.now() - startTime,
        error: `输入安全检查失败: ${inputScan.risks.map((r) => r.type).join(', ')}`,
      };
    }
  }

  try {
    const content = await routeExecution(request);
    const durationMs = Date.now() - startTime;

    // 安全检查（输出）
    let securityWarnings: string[] | undefined;
    if (!request.skipSecurityCheck) {
      const outputScan = scanContent(content, {
        toolName,
        inputSource: 'tool',
        sessionId,
      });
      if (!outputScan.passed) {
        securityWarnings = outputScan.risks.map(
          (r) => `${r.type}: ${r.matched.slice(0, 50)}`,
        );
      }
    }

    return {
      success: true,
      content,
      durationMs,
      securityWarnings,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[ToolExecutor] 工具执行失败: ${toolName}`, err);

    return {
      success: false,
      content: '',
      durationMs,
      error: errorMsg,
    };
  }
}

/**
 * 路由工具执行到正确的后端
 */
async function routeExecution(request: ToolExecutionRequest): Promise<string> {
  const { executor, toolName, parameters } = request;

  // 检查自定义执行器
  const customKey = executorKey(executor);
  const customFn = executorRegistry.get(customKey);
  if (customFn) {
    return customFn(request);
  }

  // 按执行器类型路由
  switch (executor.kind) {
    case 'core': {
      // 使用现有 toolRegistry
      return executeCoreTool(toolName, parameters);
    }

    case 'mcp': {
      // 使用 MCP 客户端管理器
      return executeMcpTool(executor.serverId, executor.toolName, parameters);
    }

    case 'plugin': {
      // 通过插件注册表执行
      return executePluginTool(executor.pluginId, executor.toolName, parameters);
    }

    case 'channel': {
      // 通过通道插件执行
      return executeChannelTool(executor.channelId, executor.actionId, parameters);
    }

    default: {
      throw new Error(`不支持的执行器类型: ${(executor as { kind: string }).kind}`);
    }
  }
}

/** 执行内置核心工具 */
async function executeCoreTool(
  toolName: string,
  parameters: Record<string, unknown>,
): Promise<string> {
  // 委托给现有 toolRegistry（executeToolCall 接收 ToolCall 对象）
  const toolCall: ToolCall = {
    id: `tool-executor:${toolName}:${Date.now()}`,
    type: 'function',
    function: {
      name: toolName,
      arguments: JSON.stringify(parameters),
    },
  };
  return executeToolCall(toolCall);
}

/** 执行 MCP 工具 */
async function executeMcpTool(
  serverId: string,
  toolName: string,
  parameters: Record<string, unknown>,
): Promise<string> {
  // serverId 在描述符体系中为 server 前缀（见 inferExecutorFromName），
  // executeMcpTool 需要完整的 mcp__{prefix}__{tool} 格式
  const mcpToolName = `mcp__${serverId}__${toolName}`;
  return mcpClientManager.executeMcpTool(mcpToolName, parameters);
}

/** 执行插件工具 */
async function executePluginTool(
  pluginId: string,
  toolName: string,
  _parameters: Record<string, unknown>,
): Promise<string> {
  // TODO: 当插件系统支持工具执行后实现
  throw new Error(`插件工具执行尚未实现: ${pluginId}.${toolName}`);
}

/** 执行通道工具 */
async function executeChannelTool(
  channelId: string,
  actionId: string,
  _parameters: Record<string, unknown>,
): Promise<string> {
  // TODO: 当通道系统支持工具执行后实现
  throw new Error(`通道工具执行尚未实现: ${channelId}.${actionId}`);
}

/** 生成执行器键 */
function executorKey(executor: ToolExecutorRef): string {
  switch (executor.kind) {
    case 'core':
      return `core:${executor.executorId}`;
    case 'plugin':
      return `plugin:${executor.pluginId}:${executor.toolName}`;
    case 'channel':
      return `channel:${executor.channelId}:${executor.actionId}`;
    case 'mcp':
      return `mcp:${executor.serverId}:${executor.toolName}`;
  }
}

/**
 * 批量执行工具调用
 *
 * @param entries - 工具计划条目列表
 * @param calls - 工具调用列表（名称 + 参数）
 * @param sessionId - 会话 ID
 * @returns 执行结果列表
 */
export async function executeToolBatch(
  entries: readonly ToolPlanEntry[],
  calls: readonly { name: string; parameters: Record<string, unknown> }[],
  sessionId?: string,
): Promise<ToolExecutionResult[]> {
  const entryMap = new Map<string, ToolPlanEntry>();
  for (const entry of entries) {
    entryMap.set(entry.descriptor.name, entry);
  }

  const results: ToolExecutionResult[] = [];
  for (const call of calls) {
    const entry = entryMap.get(call.name);
    if (!entry) {
      results.push({
        success: false,
        content: '',
        durationMs: 0,
        error: `工具未在计划中: ${call.name}`,
      });
      continue;
    }

    const result = await executeTool({
      toolName: call.name,
      parameters: call.parameters,
      executor: entry.executor,
      sessionId,
    });
    results.push(result);
  }

  return results;
}
