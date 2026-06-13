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

import { callAIModelStream, type ModelCallConfig, type ToolCall, type AIResponse, type MessageContent } from '../aiClient.js';
import { getToolDefinitions, executeToolCall } from './toolRegistry.js';

export interface ToolExecutorOptions {
  modelConfig: ModelCallConfig;
  messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  maxToolTurns?: number;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall, result: string) => void;
  /** v1.9.2: 敏感工具权限请求回调。返回 true 表示允许执行，false 表示拒绝 */
  onPermissionRequest?: (toolCall: ToolCall) => Promise<boolean>;
  reasoningEffort?: string;
}

/** 
 * 敏感工具列表 — 需要用户二次确认
 * 
 * 安全等级设计原则：
 * - shell_exec 已移除（toolRegistry 有 ALLOWED_COMMANDS 白名单 + 危险参数检测 + Shell注入防护）
 * - file_writeFile 保留（文件写入不可逆）
 * - desktop_* 保留（桌面自动化为高风险操作）
 * - 同一会话中，批准过一次的工具自动缓存，不再重复询问
 */
const SENSITIVE_TOOLS = new Set([
  'file_writeFile',
  'desktop_click',
  'desktop_type',
  'desktop_key_press',
  'desktop_app_launch',
  'desktop_app_quit',
  'desktop_window_focus',
  'desktop_clipboard',
  'desktop_scroll',
  'desktop_see',
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
    onPermissionRequest,
    reasoningEffort,
  } = options;

  const tools = getToolDefinitions();
  const currentMessages = [...messages];
  let finalContent = '';
  const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

  // v1.9.4: 会话级工具批准缓存 — 同一轮 Tool Loop 中已批准的工具不再重复询问
  const approvedToolsCache = new Set<string>();

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
      undefined,
      reasoningEffort,
    );

    // 如果没有 tool_calls，直接返回结果
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { content: response.content || finalContent, toolCalls: executedToolCalls };
    }

    // 有 tool_calls，需要执行工具并回填
    // 添加 assistant 的消息（包含 tool_calls 和 reasoning_content，用于 DeepSeek V4 thinking + tool calls）
    currentMessages.push({
      role: 'assistant',
      content: response.content || '',
      reasoning_content: response.reasoningContent,
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

      // v1.9.4: 敏感工具权限检查 — 会话缓存 + 用户确认
      if (isSensitiveTool(toolName)) {
        let hasPermission: boolean;

        if (approvedToolsCache.has(toolName)) {
          // 同一轮会话中已批准过该工具，跳过二次确认
          hasPermission = true;
        } else {
          hasPermission = onPermissionRequest
            ? await onPermissionRequest(toolCall)
            : false;
          if (hasPermission) {
            // 批准后加入缓存，本次会话后续调用不再询问
            approvedToolsCache.add(toolName);
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
          } as any);
          continue;
        }
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

    // v1.9.5-fix: 不重置 finalContent，而是累积所有轮次的 AI 文本输出
    // 之前重置为 '' 会导致：模型先输出文字再调用工具 → 文字在工具执行后丢失 → fullContent 为空 → 前端显示"内容生成失败"
    // 添加换行分隔符，避免不同轮次的内容粘连
    if (finalContent && !finalContent.endsWith('\n')) {
      finalContent += '\n\n';
    }
  }

  // 达到最大轮数，返回所有轮次累积的内容
  return { content: finalContent, toolCalls: executedToolCalls };
}
