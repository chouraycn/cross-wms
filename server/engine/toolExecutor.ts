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

import { callAIModelStream, type ModelCallConfig, type ToolCall, type AIResponse, type MessageContent, type OnRateLimitCallback } from '../aiClient.js';
import { getToolDefinitions, executeToolCall } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { truncateContextForModel } from './contextTruncate.js';
import { compressContextWithSummary } from './contextCompress.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName, getMcpServerPrefix } from './mcpTypes.js';
import { CircuitBreaker } from './circuitBreaker.js';

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
  /** v1.5.116: 外部传入的熔断器实例（可选，不传则使用模块级单例） */
  circuitBreaker?: CircuitBreaker;
  /** v1.5.116: SSE 事件回调（用于熔断告警推送） */
  onSSEEvent?: (event: Record<string, unknown>) => void;
  /** v1.5.116: 速率限制回调 — 429 时切换备用 Key */
  onRateLimit?: OnRateLimitCallback;
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
  'desktop_snapshot': 'auto',   // v3.1: 只读 UI 元素树，无副作用
  'desktop_find': 'auto',       // v3.1: 搜索缓存快照，无副作用
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

/** v2.5.0: MCP 工具风险自动分级规则 — 按工具名后缀判断 */
const MCP_AUTO_SUFFIXES = [
  'get', 'list', 'search', 'read', 'fetch', 'query', 'find', 'info',
  'check', 'count', 'exists', 'describe', 'health', 'status', 'ping',
  'preview', 'outline', 'progress', 'scrape', 'export_progress',
  'import_progress', 'get_content', 'get_info', 'get_page_info',
  'get_user_info', 'list_recent', 'list_fields', 'list_records',
  'list_tables', 'list_views', 'get_cell_data', 'get_sheet_info',
  'get_merged_cells', 'fetch_media_content', 'get_knowledge_base_list',
  'get_knowledge_list', 'search_knowledge', 'check_skill_update',
];
const MCP_CONFIRM_SUFFIXES = [
  'create', 'insert', 'update', 'write', 'send', 'post', 'put', 'patch',
  'add', 'set', 'modify', 'edit', 'rename', 'move', 'copy', 'upload',
  'insert_paragraph', 'insert_text', 'insert_image', 'insert_markdown',
  'insert_table', 'insert_cols', 'insert_rows', 'set_cell_value',
  'set_cell_style', 'set_range_value', 'merge_cell', 'set_filter',
  'set_freeze', 'set_link', 'set_dimension_size', 'add_sheet',
  'add_fields', 'add_records', 'add_table', 'add_view',
  'create_space', 'create_space_node', 'create_file', 'create_slide',
  'create_mind', 'create_flowchart', 'create_smartcanvas',
  'doc.insert_paragraph', 'doc.insert_text', 'doc.insert_image',
  'doc.insert_markdown', 'doc.insert_table', 'doc.insert_code_block',
  'doc.insert_header', 'doc.insert_footer', 'doc.insert_footnote',
  'doc.insert_comment', 'doc.insert_task', 'doc.insert_page_break',
  'doc.insert_attachment', 'doc.replace_text', 'doc.replace_image',
  'sheet.set_cell_value', 'sheet.add_sheet', 'sheet.insert_dimension',
  'slide_add_slide', 'slide_add_text', 'slide_add_image',
  'slide_add_shape', 'slide_add_table', 'slide_add_chart',
  'manage.copy_file', 'manage.move_file', 'manage.rename_file',
  'smartsheet.add_fields', 'smartsheet.add_records', 'smartsheet.add_table',
  'smartcanvas.edit',
];
const MCP_HIGH_RISK_SUFFIXES = [
  'delete', 'remove', 'drop', 'destroy', 'purge', 'erase', 'truncate',
  'doc.accept_all_revisions', 'doc.revert_revision',
  'sheet.delete_sheet', 'sheet.delete_dimension', 'sheet.clear_range_all',
  'slide_remove_slide', 'slide_remove_shapes', 'slide_remove_section_with_slides',
  'manage.delete_file', 'smartsheet.delete_records', 'smartsheet.delete_table',
  'smartsheet.delete_fields', 'smartsheet.delete_view',
  'delete_space_node',
];

/** v2.5.0: MCP 工具风险等级自动推断 */
function getMcpToolRiskLevel(toolName: string): ToolRiskLevel | null {
  if (!isMcpToolName(toolName)) return null;
  const lower = toolName.toLowerCase();
  // 优先匹配 high-risk
  for (const suffix of MCP_HIGH_RISK_SUFFIXES) {
    if (lower.endsWith(suffix)) return 'high-risk';
  }
  // 其次匹配 confirm
  for (const suffix of MCP_CONFIRM_SUFFIXES) {
    if (lower.endsWith(suffix)) return 'confirm';
  }
  // 最后匹配 auto
  for (const suffix of MCP_AUTO_SUFFIXES) {
    if (lower.endsWith(suffix)) return 'auto';
  }
  // 无法推断的 MCP 工具，默认 confirm
  return 'confirm';
}

/** v2.2.1: 获取工具风险等级 */
export function getToolRiskLevel(name: string): ToolRiskLevel {
  // 1. 先查内置工具表
  const builtin = TOOL_RISK_LEVELS[name];
  if (builtin) return builtin;
  // 2. MCP 工具自动推断
  const mcpLevel = getMcpToolRiskLevel(name);
  if (mcpLevel) return mcpLevel;
  // 3. 未知内置工具默认 confirm
  return 'confirm';
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
    circuitBreaker: externalCircuitBreaker,
    onSSEEvent,
    onRateLimit,
  } = options;

  // v1.5.116: 熔断器 — 优先使用外部传入实例，否则使用模块级单例
  const circuitBreaker = externalCircuitBreaker ?? defaultCircuitBreaker;

  const builtinTools = getToolDefinitions();
  const pluginTools = pluginRegistry.getActiveTools();
  const mcpTools = mcpClientManager.getMcpTools();
  const tools = [...builtinTools, ...pluginTools, ...mcpTools];
  const currentMessages = [...messages];
  let finalContent = '';
  const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];

  // v1.9.6: 优先使用外部传入的 Session 级缓存，否则使用函数内部的局部缓存（向后兼容）
  const approvedToolsCache = externalApprovedToolsCache ?? new Set<string>();

  /** v2.5.0: 检查工具是否在授权缓存中（支持通配符前缀匹配，如 mcp__server__*） */
  const isToolApproved = (toolName: string): boolean => {
    if (isToolApproved(toolName)) return true;
    for (const pattern of approvedToolsCache) {
      if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) {
        return true;
      }
    }
    return false;
  };

  for (let turn = 0; turn < maxToolTurns; turn++) {
    if (signal?.aborted) {
      throw new Error('请求已取消');
    }

    // v1.5.73: 每轮调用前截断上下文，防止 tool call 循环中消息膨胀超限
    // v1.5.116: 优先使用智能压缩（LLM 摘要），失败则降级为简单截断
    const ctxWindow = (modelConfig as any).contextWindow || 128000;
    const ctxMaxTokens = modelConfig.maxTokens || 8192;
    const turnTruncated = await compressContextWithSummary(currentMessages, ctxWindow, ctxMaxTokens, tools.length, modelConfig);
    if ((turnTruncated.compressed || turnTruncated.truncated) && currentMessages.length !== turnTruncated.messages.length) {
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
      onRateLimit,
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

    // v2.5.0: 批量权限收集 — 先收集所有需确认的工具，一次性请求用户审批
    const permissionNeeded: ToolCall[] = [];
    const permissionAlreadyApproved: Set<number> = new Set(); // index into response.toolCalls

    for (let i = 0; i < response.toolCalls.length; i++) {
      const toolName = response.toolCalls[i].function.name;
      if (needsPermission(toolName) && !isToolApproved(toolName)) {
        permissionNeeded.push(response.toolCalls[i]);
      } else if (needsPermission(toolName) && isToolApproved(toolName)) {
        permissionAlreadyApproved.add(i);
      }
    }

    // 批量请求权限
    const batchApproved = new Set<string>(); // 本轮新批准的工具名
    if (permissionNeeded.length > 0 && onPermissionRequest) {
      // 单个工具：直接调用原有 onPermissionRequest（兼容前端单个弹窗）
      if (permissionNeeded.length === 1) {
        const approved = await onPermissionRequest(permissionNeeded[0]);
        if (approved) {
          batchApproved.add(permissionNeeded[0].function.name);
        }
      } else {
        // 多个工具：逐个请求（前端已有队列机制），但优化为并发
        // v2.5.0: 使用 onPermissionRequestBatch 回调（如果支持）
        const batchResults = await Promise.all(
          permissionNeeded.map(tc => onPermissionRequest!(tc))
        );
        for (let i = 0; i < batchResults.length; i++) {
          if (batchResults[i]) {
            batchApproved.add(permissionNeeded[i].function.name);
          }
        }
      }
    }

    // 将新批准的工具加入 Session 级缓存
    for (const name of batchApproved) {
      approvedToolsCache.add(name);
    }

    // 执行每个 tool call
    for (const toolCall of response.toolCalls) {
      const toolName = toolCall.function.name;

      // v2.5.0: 权限检查（使用批量审批结果 + Session 缓存）
      if (needsPermission(toolName)) {
        const hasPermission = isToolApproved(toolName);

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

      // v1.5.116: 熔断检查 — 工具已熔断则跳过执行
      if (circuitBreaker.isOpen(toolName)) {
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
        } as any);
        continue;
      }

      // v1.5.116: MCP Server 级熔断检查
      if (isMcpToolName(toolName)) {
        const prefix = getMcpServerPrefix(toolName);
        if (prefix && circuitBreaker.isMcpServerOpen(prefix)) {
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
          } as any);
          continue;
        }
      }

      // v1.5.116: MCP 工具路由 — 区分 MCP 工具和内置工具
      let result: string;
      let mcpExecutionSucceeded = true;
      if (isMcpToolName(toolName)) {
        try {
          const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
          result = await mcpClientManager.executeMcpTool(toolName, parsedArgs);
          // MCP Server 级成功记录
          const prefix = getMcpServerPrefix(toolName);
          if (prefix) {
            circuitBreaker.recordMcpServerSuccess(prefix);
          }
        } catch (err) {
          mcpExecutionSucceeded = false;
          const errMsg = err instanceof Error ? err.message : String(err);
          result = JSON.stringify({ error: `MCP 工具执行异常: ${errMsg}` });
          // MCP Server 级失败记录
          const prefix = getMcpServerPrefix(toolName);
          if (prefix) {
            const mcpState = circuitBreaker.recordMcpServerFailure(prefix, errMsg);
            if (mcpState === 'open' && onSSEEvent) {
              onSSEEvent({
                type: 'circuit_breaker_triggered',
                toolName,
                failureCount: circuitBreaker.getRecord(`mcp__${prefix}__*`)?.consecutiveFailures ?? 0,
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
          const circuitState = circuitBreaker.recordFailure(toolName, result.slice(0, 100));
          if (circuitState === 'half_open') {
            const suggestion = circuitBreaker.getAlternativeSuggestion(toolName);
            if (suggestion) {
              currentMessages.push({
                role: 'system',
                content: `[熔断器] ${suggestion}`,
              } as any);
            }
          }
          if (circuitState === 'open' && onSSEEvent) {
            const record = circuitBreaker.getRecord(toolName);
            onSSEEvent({
              type: 'circuit_breaker_triggered',
              toolName,
              failureCount: record?.consecutiveFailures ?? 0,
              state: 'open',
              alternativeTool: record?.alternativeTool,
            });
          }
        } else {
          circuitBreaker.recordSuccess(toolName);
        }
      } else if (!mcpExecutionSucceeded) {
        // MCP 工具级别的熔断记录
        const circuitState = circuitBreaker.recordFailure(toolName, result.slice(0, 100));
        if (circuitState === 'half_open') {
          const suggestion = circuitBreaker.getAlternativeSuggestion(toolName);
          if (suggestion) {
            currentMessages.push({
              role: 'system',
              content: `[熔断器] ${suggestion}`,
            } as any);
          }
        }
      } else {
        circuitBreaker.recordSuccess(toolName);
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

// v1.5.116: Legacy 策略的模块级熔断器单例
const defaultCircuitBreaker = new CircuitBreaker();
