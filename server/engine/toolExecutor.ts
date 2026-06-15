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
import { pluginRegistry } from './pluginRegistry.js';
import { truncateContextForModel } from './contextTruncate.js';

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
  /** v2.2.0: 模型能力标签，透传到 callAIModelStream */
  modelCapabilities?: string[];
  /**
   * v1.9.6: 外部传入的已授权工具缓存（Session 级别）。
   * 如果传入，则使用该缓存代替函数内部新建的 Set，实现同一会话内授权一次、全局生效。
   * 如果不传，则回退到函数内部的局部 Set（保持向后兼容）。
   */
  approvedToolsCache?: Set<string>;
}

/** v2.2.1: 工具风险等级 */
export type ToolRiskLevel = 'auto' | 'confirm' | 'high-risk';

/** v2.2.1: 工具风险分级映射 */
const TOOL_RISK_LEVELS: Record<string, ToolRiskLevel> = {
  // auto-approve: 只读、无副作用
  'system_info': 'auto',
  'file_listDir': 'auto',
  'file_readFile': 'auto',
  'db_query': 'auto',
  'desktop_health': 'auto',
  'desktop_screenshot': 'auto',
  'app_setBotName': 'auto',
  'wms_inventory': 'auto',     // v2.3.2: 只读库存概览，无需确认
  'web_search': 'auto',        // v2.4.0: 只读搜索，无副作用
  'web_fetch': 'auto',         // v2.4.0: 只读抓取，无副作用

  // confirm: 写入、有副作用（需用户确认）
  'file_writeFile': 'confirm',
  'shell_exec': 'confirm',
  'web_api_call': 'confirm',   // v2.4.0: 可能写入外部系统，需确认
  'browser_navigate': 'confirm',  // v3.0: 导航到新 URL
  'browser_click': 'confirm',     // v3.0: 点击页面元素
  'browser_type': 'confirm',      // v3.0: 输入文本

  // high-risk: 不可逆、系统级（需确认 + 显示高风险警告）
  'desktop_click': 'high-risk',
  'desktop_type': 'high-risk',
  'desktop_key_press': 'high-risk',
  'desktop_app_launch': 'auto',  // v2.3.4: 改为自动授权，URL 在应用内窗口打开
  'desktop_app_quit': 'high-risk',
  'desktop_window_focus': 'high-risk',
  'desktop_clipboard': 'high-risk',
  'desktop_scroll': 'high-risk',
  'desktop_see': 'high-risk',

  // v3.0: Browser auto-approve (只读、无副作用)
  'browser_snapshot': 'auto',
  'browser_screenshot': 'auto',

  // v3.0: Webhook tools
  'web_hook_listen': 'confirm',
  'web_hook_poll': 'auto',
  'web_hook_stop': 'auto',
};

/** v2.2.1: 获取工具风险等级 */
export function getToolRiskLevel(name: string): ToolRiskLevel {
  return TOOL_RISK_LEVELS[name] || 'confirm'; // 未知工具默认需要确认
}

/** v2.2.1: 判断工具是否需要权限确认 */
function needsPermission(name: string): boolean {
  const level = getToolRiskLevel(name);
  return level === 'confirm' || level === 'high-risk';
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
    modelCapabilities,
    approvedToolsCache: externalApprovedToolsCache,
  } = options;

  const builtinTools = getToolDefinitions();
  const pluginTools = pluginRegistry.getActiveTools();
  const tools = [...builtinTools, ...pluginTools];
  const currentMessages = [...messages];
  let finalContent = '';
  const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

  // v1.9.6: 优先使用外部传入的 Session 级缓存，否则使用函数内部的局部缓存（向后兼容）
  const approvedToolsCache = externalApprovedToolsCache ?? new Set<string>();

  for (let turn = 0; turn < maxToolTurns; turn++) {
    if (signal?.aborted) {
      throw new Error('请求已取消');
    }

    // v1.5.73: 每轮调用前截断上下文，防止 tool call 循环中消息膨胀超限
    const ctxWindow = (modelConfig as any).contextWindow || 128000;
    const ctxMaxTokens = modelConfig.maxTokens || 8192;
    const turnTruncated = truncateContextForModel(currentMessages, ctxWindow, ctxMaxTokens, tools.length);
    if (turnTruncated.truncated && currentMessages.length !== turnTruncated.messages.length) {
      // 替换 currentMessages 内容（保持引用不变）
      currentMessages.length = 0;
      currentMessages.push(...turnTruncated.messages as any[]);
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
      modelCapabilities,
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

      // v1.9.6: 敏感工具权限检查 — Session 级缓存 + 用户确认
      if (needsPermission(toolName)) {
        let hasPermission: boolean;

        if (approvedToolsCache.has(toolName)) {
          // 同一 Session 中已批准过该工具，跳过二次确认
          hasPermission = true;
        } else {
          hasPermission = onPermissionRequest
            ? await onPermissionRequest(toolCall)
            : false;
          if (hasPermission) {
            // 批准后加入缓存，本 Session 后续调用不再询问
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
