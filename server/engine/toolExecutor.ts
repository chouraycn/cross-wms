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
 * v11.1: 工具执行超时、取消传播、重试机制
 */

import { callAIModelStream, type ModelCallConfig, type ToolCall, type ToolDefinition, type AIResponse, type MessageContent, type OnRateLimitCallback } from '../aiClient.js';
import { getBuiltinToolDefinitions, executeToolCall } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { truncateContextForModel, sanitizeToolMessages, type ApiMessage } from './contextTruncate.js';
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
import { ToolDependencyGraph } from './toolDependencyGraph.js';
import { logger } from '../logger.js';
import { policyEngine as acpPolicyEngine } from './acp/policy.js';
import { sessionMapper as acpSessionMapper } from './acp/sessionMapper.js';
import { toolCallReviewer } from './toolCallReviewer.js';
import { executeToolCallWithTimeout } from './toolTimeoutWrapper.js';
import { executeToolCallWithRetry, isTransientError } from './toolRetryWrapper.js';
import { executeToolCallWithMiddleware } from './toolResultMiddleware.js';
import { acquireSessionWriteLock } from '../storage/sessionWriteLock.js';
import { toolExecutionStats } from './toolExecutionStats.js';
import { toolFallbackManager } from './toolFallbackStrategy.js';
import { toolAuditLog } from './toolAuditLog.js';
import { guardToolResultContext } from './toolContextGuard.js';
import { toolExecutionQueue } from './toolExecutionQueue.js';
import { toolSendReceipts } from './toolSendReceipts.js';
import { abortPrimitives, createRunAbortController } from './abortPrimitives.js';
import { createToolCall, completeToolCall } from '../dao/taskMonitorDao.js';
// release 用于在 executeToolLoop 结束时静默清理 runController（防止内存泄漏）
const releaseRunController = (runId: string) => abortPrimitives.release(`run:${runId}`);

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
  messages: ApiMessage[];
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
  /** 助手消息 ID（用于关联工具调用到特定消息） */
  messageId?: string;
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
    messageId,
  } = options;

  // v11.1: 创建运行级别的受管理 AbortController，并桥接外部 signal
  // 这样 run 级别的中止会级联到所有子控制器（工具级），且外部取消也会传播进来
  const runId = sessionId || `run-${Date.now()}`;
  const runController = createRunAbortController(runId);
  const managedSignal = runController.signal;
  if (signal) {
    // P0: 存储 listener 并注册到 cleanupFns，在 release 时自动移除，防止外部 signal 上 listener 堆积
    const externalListener = () => {
      abortPrimitives.abort(`run:${runId}`, {
        reason: 'cascaded',
        source: 'external',
        timestamp: Date.now(),
        message: 'External signal aborted',
      });
    };
    signal.addEventListener('abort', externalListener);
    if (!runController.cleanupFns) runController.cleanupFns = [];
    runController.cleanupFns.push(() => signal.removeEventListener('abort', externalListener));
  }

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
    filteredTools = toolProfileManager.applyProfile(tools);
    logger.debug(`[ToolExecutor] Applied profile '${options.toolProfile}': ${tools.length} → ${filteredTools.length} tools`);
  }

  // 应用 Schema 投影（裁剪参数以减少 token 消耗）
  let processedTools = filteredTools;
  if (options.projectToolSchemas) {
    processedTools = projectToolSchemas(filteredTools, {
      maxDescriptionLength: 200,
      hideOptionalParams: false,
    });
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

  // v9.x: 文件生成意图检测 — 当用户明确要求“生成/创建文件”（简历、HTML、报告、代码等）时，
  // 强制模型调用 file_generateFile，避免其退化成正文输出 HTML 文本而导致前端无文件卡片。
  // 仅对首轮（用户原始请求）生效；本地模型不发送 tools，故跳过强制（否则 API 报错）。
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
  const isFileGenerationIntent = /\b(生成|创建|新建|写(一份|一个|一篇|一段)?|做(一份|一个|一篇)?|帮我(生成|创建|写|做)|简历|resume|个人简历|html?|报告|报表|代码文件|源代码|文档|下载文件|导出|pdf|word|excel)\b/i.test(userText);
  const isLocalModelCall = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.:11434/.test(modelConfig.apiEndpoint || '');
  const hasFileGenTool = processedTools.some((t) => t.function?.name === 'file_generateFile');
  const forceToolChoice = (isFileGenerationIntent && !isLocalModelCall && hasFileGenTool)
    ? { type: 'function' as const, function: { name: 'file_generateFile' } }
    : undefined;
  if (forceToolChoice) {
    logger.debug('[ToolExecutor] 检测到文件生成意图，强制 tool_choice=file_generateFile');
  }

  // v11.1: 用 try/finally 确保 runController 在函数退出时被释放，防止内存泄漏
  try {
  for (let turn = 0; turn < maxToolTurns; turn++) {
    if (managedSignal.aborted) {
      const err = new Error('请求已取消');
      err.name = 'AbortError';
      throw err;
    }

    // v1.5.73: 每轮调用前截断上下文，防止 tool call 循环中消息膨胀超限
    // v1.5.116: 优先使用智能压缩（LLM 摘要），失败则降级为简单截断
    const ctxWindow = modelConfig.contextWindow || 128000;
    // v1.5.131: 截断用 maxTokens 上限 8192，避免 384K 浪费输入空间
    const ctxMaxTokens = Math.min(modelConfig.maxTokens || 8192, 8192);
    const turnTruncated = await compressContextWithSummary(currentMessages, ctxWindow, ctxMaxTokens, processedTools.length, modelConfig);
    if ((turnTruncated.compressed || turnTruncated.truncated) && currentMessages.length !== turnTruncated.messages.length) {
      // 替换 currentMessages 内容（保持引用不变）
      currentMessages.length = 0;
      currentMessages.push(...turnTruncated.messages);
    }

    // v1.5.187: 调 AI 前硬校验 tool_calls/tool 消息配对
    // 防止截断/压缩后配对丢失导致 DeepSeek 400 错误
    const sanitizedForApi = sanitizeToolMessages(currentMessages);

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
      managedSignal,
      onThinking,
      processedTools,
      undefined,
      modelCapabilities,
      onRateLimit,
      undefined,
      turn === 0 ? forceToolChoice : undefined,
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
    });

    // v6.0: ToolDependencyGraph — 拓扑排序分析
    // 构建工具调用之间的依赖关系 DAG，分析可并行执行的层级。
    // 当前实现：仅输出分析日志，实际执行仍保持串行（避免破坏审批/熔断/钩子流程）。
    // 后续可基于 layers 实现并行执行：parallelizable 层用 Promise.all，其余串行。
    if (response.toolCalls.length > 1) {
      const graph = new ToolDependencyGraph();
      response.toolCalls.forEach((tc, i) => {
        const tcName = tc.function.name;
        let tcArgs: Record<string, unknown> = {};
        try { tcArgs = JSON.parse(tc.function.arguments || '{}'); } catch (e) {
          logger.warn('[ToolExecutor] 工具调用参数解析失败:', (e as Error).message);
        }
        let tcSource: 'builtin' | 'mcp' | 'plugin' = 'builtin';
        if (isMcpToolName(tcName)) tcSource = 'mcp';
        else if (tcName.startsWith('plugin_')) tcSource = 'plugin';
        const tcPolicy = toolPolicyEngine.evaluateTool(tcName, tcArgs, {
          source: tcSource,
          sessionId,
        });
        graph.addNode({
          id: `tc-${i}`,
          toolName: tcName,
          arguments: tc.function.arguments,
          index: i,
          permission: tcPolicy.requireApproval ? 'confirm' : 'allow',
        });
      });
      graph.inferDependencies();
      const layers = graph.topologicalSort();
      const parallelLayers = layers.filter(l => l.parallelizable && l.nodes.length > 1);
      const edges = graph.getEdges();
      logger.debug(
        `[ToolExecutor] 拓扑排序分析: ${response.toolCalls.length} 个工具调用 → ` +
        `${layers.length} 层 (${parallelLayers.length} 个可并行层, ${layers.length - parallelLayers.length} 个串行层), ` +
        `${edges.length} 条依赖边` +
        (parallelLayers.length > 0
          ? `; 可并行: ${parallelLayers.map(l => `[${l.nodes.map(n => n.toolName).join(', ')}]`).join(' ')}`
          : '')
      );
    }

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
        });
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
          });
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
        });
        continue;
      }

      // 需要审批的工具
      if (policyResult.requireApproval) {
        try {
          if (managedSignal.aborted) {
            const abortResult = JSON.stringify({
              error: `工具 '${toolName}' 会话已超时取消`,
              approvalDenied: true,
              approvalStatus: 'cancelled',
              riskLevel: policyResult.riskLevel,
            });
            executedToolCalls.push({
              name: toolName,
              arguments: toolCall.function.arguments,
              result: abortResult,
            });
            if (onToolCall) {
              onToolCall(toolCall, abortResult);
            }
            currentMessages.push({
              role: 'tool',
              content: abortResult,
              tool_call_id: toolCall.id,
            });
            continue;
          }

          const approvalRequest = approvalManager.createRequest(
            toolName,
            parsedArgs,
            policyResult.riskLevel,
            policyResult.matchedRule?.description || `工具 '${toolName}' 需要用户审批`,
            sessionId,
          );

          // 通过 SSE 发送审批请求到前端
          if (onSSEEvent) {
            onSSEEvent({
              type: 'approval',
              requestId: approvalRequest.id,
              toolName,
              toolArgs: parsedArgs,
              riskLevel: policyResult.riskLevel,
              reason: approvalRequest.reason,
              description: policyResult.matchedRule?.description || `工具 '${toolName}' 需要用户审批`,
              sessionId,
              timeout: 300000,
            });
          }

          const approvalResult = await approvalManager.waitForApproval(approvalRequest.id);
          
          if (managedSignal.aborted) {
            const abortResult = JSON.stringify({
              error: `工具 '${toolName}' 会话已超时取消`,
              approvalDenied: true,
              approvalStatus: 'cancelled',
              riskLevel: policyResult.riskLevel,
            });
            executedToolCalls.push({
              name: toolName,
              arguments: toolCall.function.arguments,
              result: abortResult,
            });
            if (onToolCall) {
              onToolCall(toolCall, abortResult);
            }
            currentMessages.push({
              role: 'tool',
              content: abortResult,
              tool_call_id: toolCall.id,
            });
            continue;
          }

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
            });
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
          });
          continue;
        }
      }

      // ===================== ACP 策略检查（实验性） =====================
      try {
        const acpSessionBinding = sessionId ? acpSessionMapper.getBinding(sessionId) : undefined;
        if (acpSessionBinding?.policyProfileId) {
          const acpResult = acpPolicyEngine.evaluateToolCall(toolName, parsedArgs);
          if (!acpResult.allowed) {
            const denyResult = JSON.stringify({
              error: acpResult.approvalReason || `工具 '${toolName}' 被 ACP 策略拒绝`,
              acpDenied: true,
              blockedRule: acpResult.blockedBy?.name,
              matchedRules: acpResult.matchedRules.map(r => r.name),
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
            });
            logger.info(
              `[ACP] 工具调用被策略拒绝: tool=${toolName}, session=${sessionId}, ` +
              `rule=${acpResult.blockedBy?.id}`,
            );
            continue;
          }
          if (acpResult.requiresApproval) {
            logger.info(
              `[ACP] 工具调用需要审批: tool=${toolName}, session=${sessionId}, ` +
              `reason=${acpResult.approvalReason}`,
            );
          }
        }
      } catch (acpErr) {
        logger.warn('[ACP] 策略检查异常，放行:', acpErr instanceof Error ? acpErr.message : String(acpErr));
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
      });
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
      });
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

    let result: string;
    // v11.0: 工具调用安全审查
    const toolReviewResult = toolCallReviewer.review({
      toolName,
      args: normalizedArgs,
      sessionId: sessionId || undefined,
    });
    if (toolReviewResult.decision === 'deny') {
      result = JSON.stringify({
        error: `工具调用被安全审查拒绝: ${toolReviewResult.rationale}`,
        riskLevel: toolReviewResult.riskLevel,
      });
      logger.warn(`[ToolExecutor] Tool call denied by reviewer: ${toolName} - ${toolReviewResult.rationale}`);
      // 通知前端
      if (onSSEEvent) {
        onSSEEvent({
          type: 'tool_call_denied',
          toolName,
          rationale: toolReviewResult.rationale,
          riskLevel: toolReviewResult.riskLevel,
        });
      }
      continue;
    }

    // ===================== 工具执行分发 =====================
    // v11.1: 集成降级策略、超时、重试、中间件链、统计、审计
    // 1. 降级策略：检查是否需要切换到备用工具
    const effectiveToolName = toolFallbackManager.checkAndFallback(toolName);
    if (effectiveToolName !== toolName) {
      logger.info(`[ToolExecutor] Fallback: ${toolName} → ${effectiveToolName}`);
    }

    // P1-3: half_open 并发探测 — 限制半开状态下的并发请求数
    const halfOpenSlot = circuitBreaker.isHalfOpen(effectiveToolName)
      ? circuitBreaker.acquireHalfOpenSlot(effectiveToolName)
      : true;
    if (!halfOpenSlot) {
      const skipResult = JSON.stringify({
        error: `工具 '${effectiveToolName}' 处于 half_open 状态且并发探测槽位已满，已跳过执行。`,
        circuitBreakerState: 'half_open',
      });
      executedToolCalls.push({ name: effectiveToolName, arguments: toolCall.function.arguments, result: skipResult });
      currentMessages.push({
        role: 'tool',
        content: skipResult,
        tool_call_id: toolCall.id,
      });
      if (onToolCall) onToolCall(toolCall, skipResult);
      if (onSSEEvent) {
        onSSEEvent({
          type: 'tool_execution_completed',
          toolName: effectiveToolName,
          toolCallId: toolCall.id,
          skipped: true,
          reason: 'half_open_concurrent_limit',
        });
      }
      continue;
    }

    // SSE: 通知工具执行开始
    if (onSSEEvent) {
      onSSEEvent({
        type: 'tool_execution_started',
        toolName: effectiveToolName,
        originalToolName: effectiveToolName !== toolName ? toolName : undefined,
        toolCallId: toolCall.id,
        sessionId,
        timestamp: Date.now(),
      });
    }

    // v11.1: 创建工具发送回执（用于会话恢复时重放）
    toolSendReceipts.createReceipt({
      id: toolCall.id,
      toolName: effectiveToolName,
      sessionId: sessionId || 'unknown',
      arguments: toolCall.function.arguments,
    });

    // 创建工具调用记录（task_monitor）
    let toolCallRecordId: string | null = null;
    if (sessionId && messageId) {
      try {
        let toolType: 'skill' | 'mcp' | 'system' | 'builtin' = 'builtin';
        if (isSkillToolName(effectiveToolName)) {
          toolType = 'skill';
        } else if (isMcpToolName(effectiveToolName)) {
          toolType = 'mcp';
        } else if (effectiveToolName.startsWith('plugin_')) {
          toolType = 'system';
        }
        const record = createToolCall({
          sessionId,
          messageId,
          toolName: effectiveToolName,
          toolType,
          arguments: parsedArgs,
        });
        toolCallRecordId = record.id;
      } catch (err) {
        logger.warn('[ToolExecutor] 创建 tool_call 记录失败:', err instanceof Error ? err.message : String(err));
      }
    }

    let mcpExecutionSucceeded = true;
    const execStartTime = Date.now();
    let retryCount = 0;
    let timedOut = false;

    const toolExecutor = async (toolSignal: AbortSignal): Promise<string> => {
      if (isSkillToolName(effectiveToolName)) {
        const skillResult = await handleSkillToolCall(
          { id: toolCall.id, type: 'function', function: { name: effectiveToolName, arguments: JSON.stringify(normalizedArgs) } },
          skillPermissionConfig,
          sessionId || `session-${Date.now()}`,
        );
        return skillResult.content;
      } else if (isMcpToolName(effectiveToolName)) {
        const mcpResult = await mcpClientManager.executeMcpTool(effectiveToolName, normalizedArgs, { signal: toolSignal });
        const prefix = getMcpServerPrefix(effectiveToolName);
        if (prefix) {
          circuitBreaker.recordMcpServerSuccess(prefix);
        }
        return mcpResult;
      } else {
        return executeToolCall({
          ...toolCall,
          function: {
            ...toolCall.function,
            name: effectiveToolName,
            arguments: JSON.stringify(normalizedArgs),
          },
        });
      }
    };

    try {
      const retryResult = await executeToolCallWithRetry(effectiveToolName, () =>
        toolExecutionQueue.enqueue(
          {
            id: toolCall.id,
            toolName: effectiveToolName,
            args: normalizedArgs,
            priority: 'normal',
            sessionId,
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
      mcpExecutionSucceeded = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : undefined;
      timedOut = errName === 'ToolTimeoutError';

      result = JSON.stringify({
        error: `工具执行异常: ${errMsg}`,
        errorName: errName,
        retryAttempts: retryCount,
        timedOut,
      });

      if (isMcpToolName(effectiveToolName)) {
        const prefix = getMcpServerPrefix(effectiveToolName);
        if (prefix) {
          const mcpState = circuitBreaker.recordMcpServerFailure(prefix, errMsg);
          if (mcpState === 'open' && onSSEEvent) {
            onSSEEvent({
              type: 'circuit_breaker_triggered',
              toolName: effectiveToolName,
              failureCount: circuitBreaker.getRecord(`mcp__${prefix}__*`)?.consecutiveFailures ?? 0,
              state: 'open',
            });
          }
        }
      }
    }

    // 2. 结果中间件：截断、错误分类
    const middlewareResult = executeToolCallWithMiddleware(effectiveToolName, result);
    result = middlewareResult.content;

    if (middlewareResult.truncated) {
      logger.debug(`[ToolExecutor] Tool result truncated: ${effectiveToolName} (${middlewareResult.estimatedChars} chars)`);
    }

    // 3. 上下文保护：防止工具结果撑爆 context window
    result = guardToolResultContext(result, currentMessages, modelConfig.contextWindow || 128000);

    // 4. 统计记录
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

    // 5. 审计日志
    toolAuditLog.log({
      toolName: effectiveToolName,
      originalToolName: effectiveToolName !== toolName ? toolName : undefined,
      sessionId,
      args: normalizedArgs,
      result: result.slice(0, 500),
      success: middlewareResult.errorType === 'none',
      durationMs: Date.now() - execStartTime,
      errorType: middlewareResult.errorType === 'none' ? undefined : middlewareResult.errorType,
      truncated: middlewareResult.truncated,
    });

    // 更新工具调用记录（task_monitor）
    if (toolCallRecordId) {
      try {
        const success = middlewareResult.errorType === 'none';
        let resultData: unknown = null;
        let errorMsg: string | undefined;
        if (success) {
          try {
            resultData = JSON.parse(result);
          } catch {
            resultData = result;
          }
        } else {
          errorMsg = middlewareResult.errorMessage || 'Tool execution failed';
        }
        completeToolCall(toolCallRecordId, {
          success,
          result: resultData,
          error: errorMsg,
        });
      } catch (err) {
        logger.warn('[ToolExecutor] 更新 tool_call 记录失败:', err instanceof Error ? err.message : String(err));
      }
    }

    // SSE: 通知工具执行完成
    if (onSSEEvent) {
      onSSEEvent({
        type: 'tool_execution_completed',
        toolName: effectiveToolName,
        toolCallId: toolCall.id,
        sessionId,
        success: middlewareResult.errorType === 'none',
        errorType: middlewareResult.errorType === 'none' ? undefined : middlewareResult.errorType,
        durationMs: Date.now() - execStartTime,
        retryCount,
        truncated: middlewareResult.truncated,
        resultSize: result.length,
        timestamp: Date.now(),
      });
    }

    // v11.1: 完成/失败工具发送回执
    if (middlewareResult.errorType === 'none') {
      toolSendReceipts.completeReceipt(toolCall.id, result, retryCount);
    } else {
      toolSendReceipts.failReceipt(toolCall.id, middlewareResult.errorMessage || 'Unknown error', retryCount);
    }

    // v1.5.116: 熔断器 — 记录工具成功/失败
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
            });
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
      const circuitState = circuitBreaker.recordFailure(toolName, result.slice(0, 100));
      if (circuitState === 'half_open') {
        const suggestion = circuitBreaker.getAlternativeSuggestion(toolName);
        if (suggestion) {
          currentMessages.push({
            role: 'system',
            content: `[熔断器] ${suggestion}`,
          });
        }
      }
    } else {
      circuitBreaker.recordSuccess(toolName);
    }

    await pluginHooks.executeHooks('after_tool_call', {
      sessionId,
      toolCall: {
        toolName,
        args: parsedArgs,
      },
      toolResult: result,
    });

    executedToolCalls.push({
      name: toolName,
      arguments: toolCall.function.arguments,
      result,
    });

    if (onToolCall) {
      onToolCall(toolCall, result);
    }

    currentMessages.push({
      role: 'tool',
      content: result,
      tool_call_id: toolCall.id,
    });

    // P1-3: 释放 half_open 并发探测槽位
    if (circuitBreaker.isHalfOpen(effectiveToolName)) {
      circuitBreaker.releaseHalfOpenSlot(effectiveToolName);
    }
    } // 闭合内层 for (const toolCall) 循环
  }

  // v1.9.5-fix: 不重置 finalContent，而是累积所有轮次的 AI 文本输出
  // 之前重置为 '' 会导致：模型先输出文字再调用工具 → 文字在工具执行后丢失 → fullContent 为空 → 前端显示"内容生成失败"
  // 添加换行分隔符，避免不同轮次的内容粘连
  if (finalContent && !finalContent.endsWith('\n')) {
    finalContent += '\n\n';
  }

  // 达到最大轮数，返回所有轮次累积的内容
  return {
    content: finalContent,
    toolCalls: executedToolCalls,
    thinkingSignature: lastThinkingSignature,
    redacted: lastRedacted,
  };
  } finally {
    // v11.1: 释放 runController，防止内存泄漏（无论正常完成、异常、用户取消都会执行）
    releaseRunController(runId);
  }
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
