/**
 * AgentOrchestrator — 主 Agent 编排器
 *
 * v8.0: 多 Agent 架构核心组件
 * - 评估任务复杂度，决定直接执行还是拆分
 * - 将复杂任务拆分为子任务 DAG
 * - 为子任务分配合适的专业 Agent
 * - 按拓扑层级并行执行子任务
 * - 收集所有子任务结果，合成最终回复
 *
 * 子 Agent 执行隔离：
 * - 每个子 Agent 使用自己的 SOUL.md 作为 system prompt
 * - 工具列表按 AgentProfile.allowedTools / deniedTools 过滤
 * - 子任务之间不共享上下文（通过 decomposition prompt 传递所需信息）
 */

import { ReActExecutor } from './reactExecutor.js';
import { Observer } from './observer.js';
import { Planner } from './planner.js';
import { TaskDecomposer, type DecomposeAssessment } from './taskDecomposer.js';
import { agentRegistry, type AgentProfile } from './agentRegistry.js';
import { emitAgentEvent, onAgentEvent } from './eventBus.js';
import { AgentEventType } from '../../shared/types/agent.js';
import { callAIModel } from '../aiClient.js';
import type { ModelCallConfig, MessageContent, ToolCall } from '../aiClient.js';
import { getToolDefinitions } from './toolRegistry.js';
import { pluginRegistry } from './pluginRegistry.js';
import { mcpClientManager } from './mcpClientManager.js';
import { ExecutionMode, type ExecutionStrategyOptions } from './executionStrategy.js';
import type { ToolExecutionResult } from './toolExecutor.js';
import type {
  TaskDecomposition,
  SubTask,
  SubTaskStatus,
  OrchestratorResult,
  SubTaskProgressData,
  AgentEventPayload,
} from '../../shared/types/agent.js';
import { logger } from '../logger.js';
import { loadAgentSoul } from './soulLoader.js';

// ===================== 常量 =====================

/** 子任务默认超时 ms */
const SUBTASK_TIMEOUT_MS = 180000; // 3 分钟

/** 编排结果合成时最大参考子任务结果长度 */
const MAX_SUBTASK_RESULT_FOR_SYNTHESIS = 2000;

// ===================== AgentOrchestrator =====================

/**
 * 主 Agent 编排器
 *
 * 使用方式：
 * ```typescript
 * const orchestrator = new AgentOrchestrator();
 * const result = await orchestrator.execute(strategyOptions);
 * ```
 *
 * 编排流程：
 * 1. 评估任务复杂度（规则引擎）
 * 2. 无需拆分 → 降级为 ReAct 直接执行
 * 3. 需要拆分 → 调用 LLM 生成子任务 DAG
 * 4. 为子任务分配 Agent（按能力匹配）
 * 5. 按拓扑层级并行执行
 * 6. 收集结果，调用 LLM 合成最终回复
 */
export class AgentOrchestrator {
  private decomposer: TaskDecomposer;
  private sharedObserver: Observer;
  private sharedPlanner: Planner;

  constructor() {
    this.decomposer = new TaskDecomposer();
    this.sharedObserver = new Observer();
    this.sharedPlanner = new Planner();
  }

  // ===================== 主入口 =====================

  /**
   * 执行编排（作为 IExecutionStrategy 的自定义实现）
   *
   * @param options - 执行策略选项（含模型配置、消息历史、SSE 回调等）
   * @returns 编排执行结果
   */
  async execute(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    const { modelConfig, messages, signal, onSSEEvent } = options;

    // 1. 提取用户消息
    const userMessage = this.extractUserMessage(messages);
    if (!userMessage) {
      logger.debug('[Orchestrator] 无用户消息，降级为 ReAct');
      return this.executeWithReAct(options);
    }

    const sessionId = this.extractSessionId(messages);

    // 2. 评估是否拆分
    const assessment: DecomposeAssessment = this.decomposer.assessComplexity(userMessage);
    logger.debug(`[Orchestrator] 复杂度评估: shouldDecompose=${assessment.shouldDecompose}, reason=${assessment.reason}`);

    if (!assessment.shouldDecompose || assessment.estimatedSubTasks < 2) {
      logger.debug('[Orchestrator] 无需拆分，降级为 ReAct');
      return this.executeWithReAct(options);
    }

    // 3. 拆分任务
    let decomposition: TaskDecomposition | null = null;
    try {
      decomposition = await this.decomposer.decompose(modelConfig, userMessage, sessionId, signal);
    } catch (err) {
      logger.error('[Orchestrator] 任务拆分失败:', err instanceof Error ? err.message : String(err));
    }

    if (!decomposition) {
      logger.debug('[Orchestrator] 拆分结果为空，降级为 ReAct');
      return this.executeWithReAct(options);
    }

    // 4. 推送拆分结果到 SSE
    if (onSSEEvent) {
      onSSEEvent({
        type: 'task_decomposition',
        decomposition: {
          id: decomposition.id,
          originalTask: decomposition.originalTask,
          subTasks: decomposition.subTasks.map(st => ({
            id: st.id,
            description: st.description,
            assignedAgentId: st.assignedAgentId,
            dependsOn: st.dependsOn,
            priority: st.priority,
            status: st.status,
          })),
          hasParallelism: decomposition.hasParallelism,
        },
      });
    }

    // 5. 分配 Agent
    this.assignAgents(decomposition);

    // 6. 执行子任务
    const startTime = Date.now();
    const execResult = await this.executeDecomposition(
      decomposition,
      modelConfig,
      messages,
      onSSEEvent,
      signal,
    );
    const totalDuration = Date.now() - startTime;

    // 7. 合成最终回复
    const finalContent = await this.synthesizeResult(
      modelConfig,
      decomposition,
      execResult.subTaskResults,
      userMessage,
      signal,
    );

    // 8. 推送编排完成事件
    if (onSSEEvent) {
      onSSEEvent({
        type: 'orchestration_complete',
        content: finalContent,
        stats: execResult.stats,
        duration: totalDuration,
      });
    }

    return {
      content: finalContent,
      toolCalls: execResult.toolCalls,
    };
  }

  // ===================== Agent 分配 =====================

  /**
   * 为子任务分配合适的 Agent
   */
  private assignAgents(decomposition: TaskDecomposition): void {
    for (const subTask of decomposition.subTasks) {
      // 已经有分配（LLM 返回的 requiredRole）则按角色查找
      let agent: AgentProfile | null = null;

      // 从 LLM 返回中获取推荐角色（存在 prompt 的元信息中）
      const roleHint = this.extractRoleHint(subTask.prompt);

      if (roleHint) {
        const candidates = agentRegistry.getByRole(roleHint as AgentProfile['role']);
        agent = candidates.find(a => a.status === 'idle') || candidates[0] || null;
      }

      // 回退：按任务描述匹配
      if (!agent) {
        agent = agentRegistry.findBestAgent(subTask.description);
      }

      // 回退：使用第一个空闲的非 orchestrator Agent
      if (!agent) {
        const fallback = agentRegistry.getAll()
          .filter(a => a.role !== 'orchestrator' && a.status !== 'error' && a.status !== 'terminated');
        agent = fallback[0] || null;
      }

      if (agent) {
        subTask.assignedAgentId = agent.id;
        agentRegistry.updateStatus(agent.id, 'busy');
        logger.debug(`[Orchestrator] 子任务 ${subTask.id} 分配给 Agent ${agent.id} (${agent.role})`);
      } else {
        logger.warn(`[Orchestrator] 子任务 ${subTask.id} 无可用 Agent`);
      }
    }
  }

  // ===================== 子任务执行 =====================

  /**
   * 按拓扑层级执行子任务（同层并行，跨层串行）
   */
  private async executeDecomposition(
    decomposition: TaskDecomposition,
    modelConfig: ModelCallConfig,
    parentMessages: Array<{ role: string; content: MessageContent; tool_calls?: unknown; tool_call_id?: string }>,
    onSSEEvent?: (event: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<{
    subTaskResults: OrchestratorResult['subTaskResults'];
    toolCalls: ToolExecutionResult['toolCalls'];
    stats: OrchestratorResult['stats'];
  }> {
    const layers = new TaskDecomposer().getParallelLayers(decomposition.subTasks);
    const subTaskResults: OrchestratorResult['subTaskResults'] = [];
    const allToolCalls: ToolExecutionResult['toolCalls'] = [];
    let completed = 0;
    let failed = 0;
    const cancelled = 0;

    decomposition.status = 'executing';

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      logger.debug(`[Orchestrator] 执行层级 ${layerIdx + 1}/${layers.length}，共 ${layer.length} 个子任务（并行）`);

      // 并行执行当前层的所有子任务
      const layerPromises = layer.map(subTask =>
        this.executeSubTask(subTask, modelConfig, parentMessages, onSSEEvent, signal),
      );

      const layerResults = await Promise.allSettled(layerPromises);

      // 收集结果
      for (let i = 0; i < layer.length; i++) {
        const subTask = layer[i];
        const result = layerResults[i];

        if (result.status === 'fulfilled') {
          const { content, toolCalls } = result.value;
          subTask.status = 'completed';
          subTask.result = content;
          subTask.completedAt = new Date().toISOString();
          completed++;

          const duration = Date.now() - new Date(subTask.startedAt || subTask.createdAt).getTime();

          allToolCalls.push(...toolCalls);
          subTaskResults.push({
            subTaskId: subTask.id,
            description: subTask.description,
            status: 'completed',
            result: content,
            agentId: subTask.assignedAgentId || 'unknown',
            duration,
          });

          // 记录执行结果到 Agent 历史
          if (subTask.assignedAgentId) {
            agentRegistry.recordExecution(subTask.assignedAgentId, {
              agentId: subTask.assignedAgentId,
              subTaskId: subTask.id,
              taskDescription: subTask.description,
              status: 'success',
              duration,
            });
          }
        } else {
          const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          subTask.status = 'failed';
          subTask.error = errorMsg;
          subTask.completedAt = new Date().toISOString();
          failed++;

          const duration = Date.now() - new Date(subTask.startedAt || subTask.createdAt).getTime();

          subTaskResults.push({
            subTaskId: subTask.id,
            description: subTask.description,
            status: 'failed',
            result: null,
            agentId: subTask.assignedAgentId || 'unknown',
            duration,
          });

          // 记录执行结果到 Agent 历史
          if (subTask.assignedAgentId) {
            const isTimeout = errorMsg.includes('超时') || errorMsg.includes('timeout');
            agentRegistry.recordExecution(subTask.assignedAgentId, {
              agentId: subTask.assignedAgentId,
              subTaskId: subTask.id,
              taskDescription: subTask.description,
              status: isTimeout ? 'timeout' : 'failure',
              duration,
            });
          }
        }

        // 释放 Agent
        if (subTask.assignedAgentId) {
          agentRegistry.updateStatus(subTask.assignedAgentId, 'idle');
        }
      }
    }

    decomposition.status = failed === 0 ? 'completed' : 'failed';
    decomposition.completedAt = new Date().toISOString();

    return {
      subTaskResults,
      toolCalls: allToolCalls,
      stats: {
        total: decomposition.subTasks.length,
        completed,
        failed,
        cancelled,
        parallelGroups: layers.length,
      },
    };
  }

  /**
   * 执行单个子任务
   */
  private async executeSubTask(
    subTask: SubTask,
    modelConfig: ModelCallConfig,
    parentMessages: Array<{ role: string; content: MessageContent; tool_calls?: unknown; tool_call_id?: string }>,
    onSSEEvent?: (event: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<{ content: string; toolCalls: ToolExecutionResult['toolCalls'] }> {
    subTask.status = 'running';
    subTask.startedAt = new Date().toISOString();

    const agentId = subTask.assignedAgentId;
    const agent = agentId ? agentRegistry.get(agentId) : null;

    // 构造子 Agent 的消息上下文
    const agentMessages = this.buildAgentMessages(subTask, agent ?? null, parentMessages);

    // 获取过滤后的工具
    const allTools = [
      ...getToolDefinitions(),
      ...pluginRegistry.getActiveTools(),
      ...mcpClientManager.getMcpTools(),
    ];
    const filteredTools = agentId
      ? agentRegistry.filterToolsForAgent(agentId, allTools)
      : allTools;

    // 推送子任务开始事件
    if (onSSEEvent) {
      onSSEEvent({
        type: 'sub_task_start',
        subTaskId: subTask.id,
        description: subTask.description,
        agentId: agentId || 'unknown',
      });
    }

    // 执行 ReAct
    const executor = new ReActExecutor(
      this.sharedObserver,
      this.sharedPlanner,
    );

    try {
      // 使用超时包装
      const timeoutSignal = this.createTimeoutSignal(SUBTASK_TIMEOUT_MS, signal);

      const result = await executor.execute({
        executionMode: ExecutionMode.REACT,
        modelConfig: agent?.modelId ? { ...modelConfig, id: agent.modelId } : modelConfig,
        messages: agentMessages,
        maxToolTurns: 15,
        signal: timeoutSignal,
        onChunk: undefined,
        onThinking: undefined,
        onToolCall: (toolCall, result) => {
          // 推送子任务工具调用事件
          if (onSSEEvent) {
            onSSEEvent({
              type: 'sub_task_tool_call',
              subTaskId: subTask.id,
              agentId: agentId || 'unknown',
              toolName: toolCall.function.name,
            });
          }
        },
        onPermissionRequest: undefined,
        onSSEEvent: (event) => {
          // 转发子任务的 ReAct 事件
          if (onSSEEvent) {
            onSSEEvent({
              type: 'sub_task_progress',
              subTaskId: subTask.id,
              agentId: agentId || 'unknown',
              reactPhase: (event as Record<string, unknown>).type,
            });
          }
        },
      });

      return { content: result.content, toolCalls: result.toolCalls };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[Orchestrator] 子任务 ${subTask.id} 执行失败:`, errorMsg);
      throw err; // 让调用方处理
    }
  }

  // ===================== 结果合成 =====================

  /**
   * 合成最终回复：融合所有子任务结果
   */
  private async synthesizeResult(
    modelConfig: ModelCallConfig,
    decomposition: TaskDecomposition,
    subTaskResults: OrchestratorResult['subTaskResults'],
    originalUserMessage: string,
    signal?: AbortSignal,
  ): Promise<string> {
    // 构造合成 prompt
    const resultsText = subTaskResults
      .map(r => {
        const header = `### ${r.description} (${r.status})`;
        const body = r.status === 'completed' && r.result
          ? r.result.slice(0, MAX_SUBTASK_RESULT_FOR_SYNTHESIS)
          : `失败: ${r.result || '未知错误'}`;
        return `${header}\n${body}`;
      })
      .join('\n\n');

    const synthesisPrompt = `你是任务统筹者。多个专业 Agent 已经并行完成了子任务，请你根据所有子任务的结果，给出完整、连贯的最终回复。

原始用户任务：
${originalUserMessage}

子任务执行结果：
${resultsText}

要求：
1. 融合所有子任务结果，不遗漏关键信息
2. 按逻辑顺序组织内容（不是简单罗列子任务结果）
3. 如果某些子任务失败，说明失败原因并给出替代建议
4. 使用清晰的结构（标题、列表等）呈现
5. 不要提及"子任务""Agent"等内部实现细节，直接给出用户需要的答案`;

    const messages: Array<{ role: string; content: MessageContent }> = [
      { role: 'system', content: '你是专业的任务统筹者，负责汇总多个子任务结果并给出最终回复。' },
      { role: 'user', content: synthesisPrompt },
    ];

    try {
      const synthesis = await callAIModel(
        { ...modelConfig, temperature: 0.3 },
        messages,
        signal,
      );
      return synthesis;
    } catch (err) {
      logger.error('[Orchestrator] 结果合成失败，使用原始拼接:', err);
      // 降级：直接拼接子任务结果
      return subTaskResults
        .filter(r => r.status === 'completed' && r.result)
        .map(r => `## ${r.description}\n${r.result}`)
        .join('\n\n');
    }
  }

  // ===================== 消息构造 =====================

  /**
   * 为子 Agent 构造隔离的消息上下文
   *
   * 子 Agent 只看到：
   * 1. 系统消息（含 Agent 的 SOUL.md）
   * 2. 子任务执行指令（prompt）
   * 不看到完整对话历史（避免干扰）
   */
  private buildAgentMessages(
    subTask: SubTask,
    agent: AgentProfile | null,
    parentMessages: Array<{ role: string; content: MessageContent }>,
  ): Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> {
    let soul = agent?.soul || '';

    // 如果子 Agent 有自定义 soulFile，加载并注入
    if (agent?.soulFile) {
      const agentSoulContent = loadAgentSoul(agent.soulFile);
      if (agentSoulContent) {
        const parts: string[] = [];
        // 提取身份描述
        const identityMatch = agentSoulContent.match(/## 身份\s*\n\s*([^\n]+)/);
        if (identityMatch) {
          parts.push(`[身份] ${identityMatch[1].trim()}`);
        }
        // 提取价值观
        const valuesMatch = agentSoulContent.match(/## 价值观\s*\n([\s\S]*?)(?=##|$)/);
        if (valuesMatch) {
          const values = valuesMatch[1]
            .split('\n')
            .filter(l => /^\s*\d+\./.test(l))
            .map(l => l.replace(/^\s*\d+\.\s*/, '').trim())
            .join('；');
          if (values) parts.push(`[价值观] ${values}`);
        }
        // 提取禁区
        const forbiddenMatch = agentSoulContent.match(/## 禁区\s*\n([\s\S]*?)(?=##|$)/);
        if (forbiddenMatch) {
          const forbidden = forbiddenMatch[1]
            .split('\n')
            .filter(l => /^\s*[-*]\s+/.test(l))
            .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
            .join('；');
          if (forbidden) parts.push(`[禁区] ${forbidden}`);
        }
        // 提取专业能力
        const skillsMatch = agentSoulContent.match(/## 专业能力\s*\n([\s\S]*?)(?=##|$)/);
        if (skillsMatch) {
          const skills = skillsMatch[1]
            .split('\n')
            .filter(l => /^\s*[-*]\s+/.test(l))
            .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
            .join('；');
          if (skills) parts.push(`[专业能力] ${skills}`);
        }
        if (parts.length > 0) {
          soul = `${soul}\n\n${parts.join('\n')}`;
        }
      }
    }

    const systemContent = soul
      ? `${soul}\n\n你正在执行一个子任务。请专注于完成以下任务，不要关心其他子任务。`
      : '你正在执行一个子任务。请专注于完成以下任务。';

    const messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> = [
      { role: 'system', content: systemContent },
      { role: 'user', content: subTask.prompt },
    ];

    return messages;
  }

  // ===================== 工具方法 =====================

  /**
   * 从消息列表中提取最后一条用户消息
   */
  private extractUserMessage(messages: Array<{ role: string; content: MessageContent }>): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    }
    return null;
  }

  /**
   * 从消息列表中提取会话 ID（通过查找 sessionId 相关字段）
   */
  private extractSessionId(messages: Array<{ role: string; content: MessageContent }>): string {
    // 尝试从第一条 system 消息中提取 sessionId
    for (const msg of messages) {
      if (msg.role === 'system' && typeof msg.content === 'string') {
        const match = msg.content.match(/session[_ ]?id[:\s]+([a-zA-Z0-9_-]+)/i);
        if (match) return match[1];
      }
    }
    return 'unknown';
  }

  /**
   * 从子任务 prompt 中提取角色提示
   */
  private extractRoleHint(prompt: string): string | null {
    const match = prompt.match(/requiredRole["\s]*:\s*["']?(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * 创建带超时的 AbortSignal
   */
  private createTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal): AbortSignal {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort(new Error(`子任务执行超时（${timeoutMs}ms）`));
    }, timeoutMs);

    // 父 signal 取消时也要取消
    if (parentSignal) {
      parentSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.abort(parentSignal.reason);
      });
    }

    return controller.signal;
  }

  /**
   * 降级：直接用 ReAct 执行（不拆分）
   */
  private async executeWithReAct(options: ExecutionStrategyOptions): Promise<ToolExecutionResult> {
    const executor = new ReActExecutor(this.sharedObserver, this.sharedPlanner);
    const result = await executor.execute(options);
    return {
      content: result.content,
      toolCalls: result.toolCalls,
    };
  }
}
