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
import { getBuiltinToolDefinitions, executeToolCall } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { truncateContextForModel, sanitizeToolMessages } from './contextTruncate.js';
import { compressContextWithSummary } from './contextCompress.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName, getMcpServerPrefix } from './mcpTypes.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { isSkillToolName, handleSkillToolCall } from './skillToolBridge.js';
import type { SkillPermissionConfig } from '../types/skill-runtime.js';
import toolPolicyEngine from './toolPolicyEngine.js';
import approvalManager from './approvalManager.js';
import pluginHooks from './pluginHooks.js';
import { validateAndNormalizeToolParams } from './toolParams.js';
import { toolLoopDetector } from './toolLoopDetection.js';
import { toolProfileManager, projectToolSchemas, type ToolProfileId } from './toolProfiles.js';
import { logger } from '../logger.js';

// ===================== 工具结果错误检测 =====================

function isToolResultFailed(result: string): boolean {
  const trimmed = result.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        if ('success' in parsed) {
          return parsed.success === false;
        }
        if ('error' in parsed && parsed.error != null) {
          return true;
        }
      }
      return false;
    } catch {
      // JSON 解析失败，回退到字符串匹配
    }
  }
  const errorPatterns = [
    '"error":',
    '"error" :',
    'Error: ',
    'TypeError: ',
    'ReferenceError: ',
    'throw new Error',
  ];
  return errorPatterns.some(p => result.includes(p));
}

export interface ToolExecutorOptions {
  modelConfig: ModelCallConfig;
  messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  maxToolTurns?: number;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall, result: string) => void;
  /** v8.2: Agent 任务开始 */
  onAgentStart?: (agentId: string, agentRole: string, taskDescription: string, subTaskId?: string) => void;
  /** v8.2: Agent 任务结束 */
  onAgentEnd?: (agentId: string, agentRole: string, status: 'success' | 'failed' | 'timeout', duration?: number, error?: string) => void;
  /** v8.2: 子任务创建 */
  onSubtaskCreate?: (subTaskId: string, description: string, dependsOn?: string[], priority?: number) => void;
  /** v8.2: 子任务分配给 Agent */
  onSubtaskAssign?: (subTaskId: string, agentId: string, agentRole: string) => void;
  /** v8.2: 子任务完成 */
  onSubtaskComplete?: (subTaskId: string, description: string, status: 'completed' | 'failed', agentId: string, duration?: number, resultSummary?: string) => void;
  /** 反思评估结果 */
  onReflect?: (reflection: any) => void;
  /** 执行计划生成 */
  onPlan?: (plan: any) => void;
  /** v2.2.0: 模型能力标签，透传到 callAIModelStream */
  modelCapabilities?: string[];
  circuitBreaker?: CircuitBreaker;
  /** v1.5.116: SSE 事件回调（用于熔断告警推送） */
  onSSEEvent?: (event: Record<string, unknown>) => void;
  /** v1.5.116: 速率限制回调 — 429 时切换备用 Key */
  onRateLimit?: OnRateLimitCallback;
  /** v9.1: Skill 权限配置（Skill 四层架构） */
  skillPermissionConfig?: SkillPermissionConfig;
  /** 会话 ID（用于审批流和插件钩子） */
  sessionId?: string;
  /** 工具 Profile ID（用于过滤工具集） */
  toolProfile?: ToolProfileId;
  /** 是否对工具 Schema 进行投影（裁剪参数） */
  projectToolSchemas?: boolean;
  /** 上下文压缩配置 */
  compaction?: {
    enabled?: boolean;
    strategy?: string;
    thresholdRatio?: number;
    preserveRecent?: number;
  };
}

/**
 * Tool Calling 执行结果
 */
export interface ToolExecutionResult {
  content: string;
  toolCalls: Array<{ name: string; arguments: string; result: string }>;
  /** thinking 加密签名（Anthropic thinking content block 提取，可回传 API） */
  thinkingSignature?: string;
  /** 安全脱敏标记（redacted_thinking 块为 true） */
  redacted?: boolean;
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
    modelCapabilities,
    circuitBreaker: externalCircuitBreaker,
    onSSEEvent,
    onRateLimit,
    sessionId,
  } = options;

  // v1.5.116: 熔断器 — 优先使用外部传入实例，否则使用模块级单例
  const circuitBreaker = externalCircuitBreaker ?? defaultCircuitBreaker;

  const builtinTools = getBuiltinToolDefinitions();
  const pluginTools = pluginRegistry.getActiveTools();
  const mcpTools = mcpClientManager.getMcpTools();
  // v9.1: Skill 工具定义注入（Skill 四层架构）
  const skillPermissionConfig = options.skillPermissionConfig ?? { allow: ['*'], deny: [], elevated: { enabled: 'ask' } };
  const { getSkillToolDefinitions } = await import('./skillToolBridge.js');
  const skillTools = getSkillToolDefinitions(skillPermissionConfig);
  const tools = [...builtinTools, ...pluginTools, ...mcpTools, ...skillTools];

  // 应用 Tool Profile 过滤（如果指定）
  let filteredTools = tools;
  if (options.toolProfile) {
    toolProfileManager.setProfile(options.toolProfile);
    filteredTools = toolProfileManager.applyProfile(tools as any) as typeof tools;
    logger.debug(`[ToolExecutor] Applied profile '${options.toolProfile}': ${tools.length} → ${filteredTools.length} tools`);
  }

  // 应用 Schema 投影（裁剪参数以减少 token 消耗）
  let processedTools = filteredTools;
  if (options.projectToolSchemas) {
    processedTools = projectToolSchemas(filteredTools as any, {
      maxDescriptionLength: 200,
      hideOptionalParams: false,
    }) as typeof filteredTools;
    logger.debug(`[ToolExecutor] Applied schema projection to ${processedTools.length} tools`);
  }
  const currentMessages = [...messages];
  let finalContent = '';
  const executedToolCalls: Array<{ name: string; arguments: string; result: string }> = [];
  // thinking signature（从最近一次 AIResponse 上抛，供细粒度 SSE 事件使用）
  let lastThinkingSignature: string | undefined;
  let lastRedacted: boolean | undefined;

  // 重置工具循环检测器（每次新的 Tool Calling 循环独立检测）
  toolLoopDetector.reset();

  for (let turn = 0; turn < maxToolTurns; turn++) {
    if (signal?.aborted) {
      throw new Error('请求已取消');
    }

    // v1.5.73: 每轮调用前截断上下文，防止 tool call 循环中消息膨胀超限
    // v1.5.116: 优先使用智能压缩（LLM 摘要），失败则降级为简单截断
    const ctxWindow = (modelConfig as any).contextWindow || 128000;
    // v1.5.131: 截断用 maxTokens 上限 8192，避免 384K 浪费输入空间
    const ctxMaxTokens = Math.min(modelConfig.maxTokens || 8192, 8192);
    const turnTruncated = await compressContextWithSummary(currentMessages, ctxWindow, ctxMaxTokens, processedTools.length, modelConfig);
    if ((turnTruncated.compressed || turnTruncated.truncated) && currentMessages.length !== turnTruncated.messages.length) {
      // 替换 currentMessages 内容（保持引用不变）
      currentMessages.length = 0;
      currentMessages.push(...turnTruncated.messages as any[]);
    }

    // v1.5.187: 调 AI 前硬校验 tool_calls/tool 消息配对
    // 防止截断/压缩后配对丢失导致 DeepSeek 400 错误
    const sanitizedForApi = sanitizeToolMessages(currentMessages as any[]) as any[];

    // 调用 AI，传入 tools
    await pluginHooks.executeHooks('before_ai_call', {
      sessionId,
      messages: currentMessages as Array<Record<string, unknown>>,
      extra: { modelConfig: modelConfig as unknown as Record<string, unknown> },
    });

    const response = await callAIModelStream(
      modelConfig,
      sanitizedForApi,
      (text) => {
        if (onChunk) onChunk(text);
        finalContent += text;
      },
      signal,
      onThinking,
      processedTools,
      undefined,
      modelCapabilities,
      onRateLimit,
    );

    await pluginHooks.executeHooks('after_ai_call', {
      sessionId,
      messages: currentMessages as Array<Record<string, unknown>>,
      aiResult: response as unknown as Record<string, unknown>,
    });

    // 上抛 thinking signature（多轮 tool call 取最近一次含签名的响应）
    if (response.thinkingSignature) {
      lastThinkingSignature = response.thinkingSignature;
      lastRedacted = response.redacted;
    }

    // 如果没有 tool_calls，直接返回结果
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        content: response.content || finalContent,
        toolCalls: executedToolCalls,
        thinkingSignature: lastThinkingSignature,
        redacted: lastRedacted,
      };
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

      // ===================== 工具策略评估 + 审批流 =====================
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        // 参数解析失败，使用空对象
      }

      // 确定工具来源
      let toolSource: 'builtin' | 'mcp' | 'plugin' = 'builtin';
      if (isMcpToolName(toolName)) {
        toolSource = 'mcp';
      } else if (toolName.startsWith('plugin_')) {
        toolSource = 'plugin';
      }

      // 调用策略引擎评估工具
      const policyResult = toolPolicyEngine.evaluateTool(toolName, parsedArgs, {
        source: toolSource,
        sessionId,
      });

      // 策略不允许，直接返回错误
      if (!policyResult.allowed) {
        const denyResult = JSON.stringify({
          error: policyResult.reason || `工具 '${toolName}' 被策略拒绝`,
          policyDenied: true,
          riskLevel: policyResult.riskLevel,
          deniedParams: policyResult.deniedParams,
        });
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

      // 需要审批的工具
      if (policyResult.requireApproval) {
        try {
          const approvalRequest = approvalManager.createRequest(
            toolName,
            parsedArgs,
            policyResult.riskLevel,
            policyResult.matchedRule?.description || `工具 '${toolName}' 需要用户审批`,
            sessionId,
          );
          const approvalResult = await approvalManager.waitForApproval(approvalRequest.id);
          
          if (approvalResult.status !== 'approved') {
            const rejectReason = approvalResult.rejectReason || 
              (approvalResult.status === 'timeout' ? '审批超时' : 
               approvalResult.status === 'cancelled' ? '审批已取消' : '审批被拒绝');
            const denyResult = JSON.stringify({
              error: `工具 '${toolName}' ${rejectReason}`,
              approvalDenied: true,
              approvalStatus: approvalResult.status,
              riskLevel: policyResult.riskLevel,
            });
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
        } catch (approvalErr) {
          const errMsg = approvalErr instanceof Error ? approvalErr.message : String(approvalErr);
          const errorResult = JSON.stringify({
            error: `审批流程异常: ${errMsg}`,
            approvalError: true,
          });
          executedToolCalls.push({
            name: toolName,
            arguments: toolCall.function.arguments,
            result: errorResult,
          });
          if (onToolCall) {
            onToolCall(toolCall, errorResult);
          }
          currentMessages.push({
            role: 'tool',
            content: errorResult,
            tool_call_id: toolCall.id,
          } as any);
          continue;
        }
      }

      // 记录工具调用（用于速率限制统计）
    toolPolicyEngine.recordCall(toolName);

    // ===================== 工具循环检测 =====================
    const loopCheck = toolLoopDetector.recordAndDetect(toolName, parsedArgs);
    if (loopCheck.isLoop) {
      const loopResult = JSON.stringify({
        error: `检测到工具调用循环 (${loopCheck.reason})，工具 '${loopCheck.toolName}' 已连续调用 ${loopCheck.count} 次`,
        loopDetected: true,
        reason: loopCheck.reason,
      });
      executedToolCalls.push({
        name: toolName,
        arguments: toolCall.function.arguments,
        result: loopResult,
      });
      if (onToolCall) {
        onToolCall(toolCall, loopResult);
      }
      currentMessages.push({
        role: 'tool',
        content: loopResult,
        tool_call_id: toolCall.id,
      } as any);
      continue;
    }

    // ===================== 工具参数验证和规范化 =====================
    let normalizedArgs = parsedArgs;
    try {
      normalizedArgs = validateAndNormalizeToolParams(toolName, parsedArgs);
    } catch (validationErr) {
      const errMsg = validationErr instanceof Error ? validationErr.message : String(validationErr);
      const validationResult = JSON.stringify({
        error: `工具参数验证失败: ${errMsg}`,
        validationFailed: true,
      });
      executedToolCalls.push({
        name: toolName,
        arguments: toolCall.function.arguments,
        result: validationResult,
      });
      if (onToolCall) {
        onToolCall(toolCall, validationResult);
      }
      currentMessages.push({
        role: 'tool',
        content: validationResult,
        tool_call_id: toolCall.id,
      } as any);
      continue;
    }

    // 触发 before_tool_call 钩子
    await pluginHooks.executeHooks('before_tool_call', {
      sessionId,
      toolCall: {
        toolName,
        args: normalizedArgs,
      },
      extra: { riskLevel: policyResult.riskLevel },
    });

    // ===================== 工具执行分发 =====================
    // [内置工具路径] 通过 toolRegistry.executeToolCall() 直接执行
    // [MCP工具路径] 通过 mcpClientManager.executeMcpTool() 委托执行
    // v1.5.116: MCP 工具路由 — 区分 MCP 工具和内置工具
    let result: string;
    let mcpExecutionSucceeded = true;
    // v9.1: Skill 工具路由 — 区分 Skill / MCP / 内置工具
    // [Skill 工具路径] 通过 skillToolBridge 执行（Skill 四层架构）
    if (isSkillToolName(toolName)) {
      try {
        const skillResult = await handleSkillToolCall(
          { id: toolCall.id, type: 'function', function: { name: toolName, arguments: JSON.stringify(normalizedArgs) } },
          skillPermissionConfig,
          sessionId || `session-${Date.now()}`,
        );
        result = skillResult.content;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = JSON.stringify({ error: `Skill 执行异常: ${errMsg}` });
      }
    }
    // [MCP工具路径] 委托给 mcpClientManager 执行
    else if (isMcpToolName(toolName)) {
      try {
        result = await mcpClientManager.executeMcpTool(toolName, normalizedArgs);
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
      // [内置工具路径] 通过 toolRegistry.executeToolCall() 直接执行
      result = await executeToolCall({
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(normalizedArgs),
        },
      });
    }

      // v1.5.116: 熔断器 — 记录内置工具成功/失败
      // v9.1: Skill 工具也走熔断器（非 MCP 工具）
      if (!isMcpToolName(toolName) && !isSkillToolName(toolName)) {
        const hasError = isToolResultFailed(result);
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

      // 触发 after_tool_call 钩子
      await pluginHooks.executeHooks('after_tool_call', {
        sessionId,
        toolCall: {
          toolName,
          args: parsedArgs,
        },
        toolResult: result,
      });

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
  return {
    content: finalContent,
    toolCalls: executedToolCalls,
    thinkingSignature: lastThinkingSignature,
    redacted: lastRedacted,
  };
}

// v1.5.116: Legacy 策略的模块级熔断器单例
// v6.1: 导出以便在新会话/新请求时重置（避免搜索工具永久熔断）
export const defaultCircuitBreaker = new CircuitBreaker();

/**
 * 重置默认熔断器状态
 *
 * 在以下场景调用：
 * 1. 新会话开始时
 * 2. 用户手动重试时
 * 3. 新消息请求开始时（可选）
 */
export function resetDefaultCircuitBreaker(): void {
  defaultCircuitBreaker.reset();
}
