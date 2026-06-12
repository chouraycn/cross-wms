/**
 * Tool Executor — 工具执行引擎
 *
 * 实现 Tool Calling 循环：
 * 1. 调用 AI（传入 tools 定义）
 * 2. 检测 AI 响应中的 tool_calls
 * 3. 执行工具并获取结果
 * 4. 将结果回填到消息上下文
 * 5. 再次调用 AI，直到 AI 不再调用工具
 *
 * v1.9.0: 新增 Tool Calling 执行循环
 */

import { callAIModelStream, type ModelCallConfig, type ToolCall, type AIResponse } from '../aiClient.js';
import { getToolDefinitions, executeToolCall } from './toolRegistry.js';

export interface ToolExecutorOptions {
  modelConfig: ModelCallConfig;
  messages: Array<{ role: string; content: string }>;
  maxToolTurns?: number;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall, result: string) => void;
}

/** 敏感工具列表 — 需要用户二次确认 */
const SENSITIVE_TOOLS = new Set([
  'file:writeFile',
  'shell:exec',
  'desktop:click',
  'desktop:type',
  'desktop:key_press',
  'desktop:app_launch',
  'desktop:app_quit',
  'desktop:window_focus',
  'desktop:clipboard',
  'desktop:scroll',
  'desktop:see',
]);

function isSensitiveTool(name: string): boolean {
  return SENSITIVE_TOOLS.has(name);
}

/**
 * Tool Calling 执行结果
 */
export interface ToolExecutionResult {
  content: string;
  toolCalls: Array<{ name: string; arguments: string; result: string }>;
}

/**
 * 执行 Tool Calling 循环
 *
 * @returns 最终 AI 的文本响应 + 工具调用记录
 */
export async function executeToolLoop(options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  const {
    modelConfig,
    messages,
    maxToolTurns = 10,
    signal,
    onChunk,
    onThinking,
    onToolCall,
  } = options;

  const tools = getToolDefinitions();
  const currentMessages = [...messages];
  let finalContent = '';
  const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

  for (let turn = 0; turn < maxToolTurns; turn++) {
    if (signal?.aborted) {
      throw new Error('请求已取消');
    }

    // 调用 AI，传入 tools
    const response = await callAIModelStream(
      modelConfig,
      currentMessages,
      (text) => {
        if (onChunk) onChunk(text);
        finalContent += text;
      },
      signal,
      onThinking,
      tools,
    );

    // 如果没有 tool_calls，直接返回结果
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { content: response.content || finalContent, toolCalls: executedToolCalls };
    }

    // 有 tool_calls，需要执行工具并回填
    // 添加 assistant 的消息（包含 tool_calls，用于 Anthropic 格式转换）
    currentMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    } as any);

    // 执行每个 tool call
    for (const toolCall of response.toolCalls) {
      const toolName = toolCall.function.name;

      // 敏感工具：自动拒绝（后续可扩展为用户确认机制）
      if (isSensitiveTool(toolName)) {
        const denyResult = JSON.stringify({ error: `安全限制：工具 '${toolName}' 已被禁用。请联系管理员启用。` });
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
        } as any);
        continue;
      }

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

      // 将 tool result 添加到消息上下文（含 tool_call_id，用于 Anthropic 格式转换）
      currentMessages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      } as any);
    }

    // 重置 finalContent，准备下一轮
    finalContent = '';
  }

  // 达到最大轮数，返回最后一轮的内容
  return { content: finalContent, toolCalls: executedToolCalls };
}
