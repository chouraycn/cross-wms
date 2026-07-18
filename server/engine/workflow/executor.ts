/**
 * 工作流执行引擎
 * 支持异步执行、错误处理、重试、变量上下文、表达式求值、断点暂停恢复、执行追踪等
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger.js';
import { callAIModel } from '../../aiClient.js';
import { executeToolCall as executeToolCallFromRegistry } from '../toolRegistry.js';
import { executeToolCallWithRetry } from '../toolRetryWrapper.js';
import { executeToolCallWithTimeout } from '../toolTimeoutWrapper.js';
import { executeToolCallWithMiddleware } from '../toolResultMiddleware.js';
import { toolExecutionQueue } from '../toolExecutionQueue.js';
import { toolExecutionStats } from '../toolExecutionStats.js';
import { toolAuditLog } from '../toolAuditLog.js';
import { guardToolResultContext } from '../toolContextGuard.js';
import { toolSendReceipts } from '../toolSendReceipts.js';
import { abortPrimitives, createRunAbortController } from '../abortPrimitives.js';
import { toolFallbackManager } from '../toolFallbackStrategy.js';
import { VariableContext } from './variable-context.js';
import type {
  Workflow,
  WorkflowNode,
  ExecutionContext,
  ExecutionResult,
  NodeExecutionRecord,
  WorkflowExecution,
  ConditionConfig,
  ParallelConfig,
  LoopConfig,
  ExecutionStatus,
  DelayConfig,
  ScriptConfig,
  TransformConfig,
  MergeConfig,
  SwitchConfig,
  SubWorkflowConfig,
  TraceEvent,
  WorkflowTracer,
  PauseState,
  Breakpoint,
  ParallelConfigExt,
} from './types.js';

type ActionConfig = {
  type: 'ai_call' | 'tool_execution' | 'notification' | 'data_transform' | 'api_call' | 'script';
  params: Record<string, unknown>;
};

async function sendNotification(options: { title: string; body: string; type?: string }): Promise<void> {
  logger.info(`[Notification] ${options.type || 'info'}: ${options.title} - ${options.body}`);
  if (process.platform === 'darwin') {
    try {
      const { execFile } = await import('child_process');
      execFile('osascript', [
        '-e',
        `display notification "${options.body}" with title "${options.title}" sound name "default"`,
      ]);
    } catch {
      // ignore
    }
  }
}

/**
 * 执行追踪器实现
 */
class DefaultTracer implements WorkflowTracer {
  private events: TraceEvent[] = [];

  record(event: Omit<TraceEvent, 'id' | 'timestamp'>): void {
    this.events.push({
      ...event,
      id: uuidv4(),
      timestamp: Date.now(),
    });
  }

  getEvents(executionId?: string): TraceEvent[] {
    if (executionId) {
      return this.events.filter(e => e.executionId === executionId);
    }
    return [...this.events];
  }

  clear(executionId?: string): void {
    if (executionId) {
      this.events = this.events.filter(e => e.executionId !== executionId);
    } else {
      this.events = [];
    }
  }
}

/**
 * 工作流执行器
 * 负责工作流的执行、节点调度、条件评估等核心逻辑
 */
export class WorkflowExecutor {
  private executions: Map<string, WorkflowExecution> = new Map();
  private maxConcurrentExecutions: number = 10;
  private activeExecutions: number = 0;
  private runControllers: Map<string, { runId: string; controller: ReturnType<typeof createRunAbortController> }> = new Map();
  private tracer: WorkflowTracer = new DefaultTracer();
  private breakpoints: Map<string, Breakpoint[]> = new Map();
  private pauseStates: Map<string, PauseState> = new Map();
  private pauseResolvers: Map<string, () => void> = new Map();
  private variableContexts: Map<string, VariableContext> = new Map();
  private subWorkflowLoaders: Map<string, (workflowId: string) => Promise<Workflow | null>> = new Map();
  private mergeNodeInputs: Map<string, Map<string, Record<string, unknown>>> = new Map();

  /**
   * 设置子工作流加载器
   */
  setSubWorkflowLoader(key: string, loader: (workflowId: string) => Promise<Workflow | null>): void {
    this.subWorkflowLoaders.set(key, loader);
  }

  /**
   * 获取执行追踪器
   */
  getTracer(): WorkflowTracer {
    return this.tracer;
  }

  /**
   * 设置断点
   */
  setBreakpoint(executionId: string, breakpoint: Breakpoint): void {
    const existing = this.breakpoints.get(executionId) || [];
    const idx = existing.findIndex(b => b.nodeId === breakpoint.nodeId);
    if (idx >= 0) {
      existing[idx] = breakpoint;
    } else {
      existing.push(breakpoint);
    }
    this.breakpoints.set(executionId, existing);
  }

  /**
   * 移除断点
   */
  removeBreakpoint(executionId: string, nodeId: string): void {
    const existing = this.breakpoints.get(executionId) || [];
    this.breakpoints.set(executionId, existing.filter(b => b.nodeId !== nodeId));
  }

  /**
   * 暂停执行
   */
  pauseExecution(executionId: string, reason?: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }
    this.pauseStates.set(executionId, {
      isPaused: true,
      pausedAt: Date.now(),
      reason,
    });
    this.tracer.record({
      type: 'paused',
      executionId,
      message: reason || '执行已暂停',
    });
    return true;
  }

  /**
   * 恢复执行
   */
  resumeExecution(executionId: string): boolean {
    const pauseState = this.pauseStates.get(executionId);
    if (!pauseState || !pauseState.isPaused) {
      return false;
    }
    pauseState.isPaused = false;
    this.tracer.record({
      type: 'resumed',
      executionId,
    });
    const resolver = this.pauseResolvers.get(executionId);
    if (resolver) {
      resolver();
      this.pauseResolvers.delete(executionId);
    }
    return true;
  }

  /**
   * 等待暂停恢复
   */
  private async waitForResume(executionId: string): Promise<void> {
    const pauseState = this.pauseStates.get(executionId);
    if (!pauseState || !pauseState.isPaused) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.pauseResolvers.set(executionId, resolve);
    });
  }

  /**
   * 检查并处理断点
   */
  private async checkBreakpoint(executionId: string, node: WorkflowNode): Promise<void> {
    const breakpoints = this.breakpoints.get(executionId) || [];
    const breakpoint = breakpoints.find(b => b.enabled && b.nodeId === node.id);
    if (!breakpoint) return;

    const variableCtx = this.variableContexts.get(executionId);
    if (breakpoint.condition && variableCtx) {
      const result = variableCtx.evaluate(breakpoint.condition);
      if (!result) return;
    }

    this.tracer.record({
      type: 'breakpoint_hit',
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      message: `命中断点: ${node.name}`,
    });

    this.pauseStates.set(executionId, {
      isPaused: true,
      pausedAt: Date.now(),
      pausedNodeId: node.id,
      reason: `断点: ${node.name}`,
    });

    await this.waitForResume(executionId);
  }

  /**
   * 获取变量上下文
   */
  getVariableContext(executionId: string): VariableContext | undefined {
    return this.variableContexts.get(executionId);
  }

  /**
   * 执行工作流
   */
  async execute(
    workflow: Workflow,
    triggerType: 'manual' | 'schedule' | 'event' | 'webhook',
    triggeredBy?: string,
    initialVariables?: Record<string, unknown>,
    sessionId?: string
  ): Promise<string> {
    if (this.activeExecutions >= this.maxConcurrentExecutions) {
      throw new Error('并发执行数已达上限，请稍后再试');
    }

    const executionId = uuidv4();
    const startTime = Date.now();

    const variableCtx = new VariableContext(initialVariables);
    this.variableContexts.set(executionId, variableCtx);

    const context: ExecutionContext = {
      workflowId: workflow.id,
      executionId,
      variables: variableCtx.snapshot(),
      triggerType,
      triggeredBy,
      startTime,
      sessionId,
      nodeOutputs: new Map(),
      nodeExecutions: [],
      logs: [],
    };

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      startTime,
      triggerType,
      triggeredBy,
      nodeExecutions: [],
      variables: context.variables,
      logs: [],
    };

    this.executions.set(executionId, execution);
    this.activeExecutions++;

    const runId = `wf-${executionId}`;
    const runController = createRunAbortController(runId);
    this.runControllers.set(executionId, { runId, controller: runController });

    this.tracer.record({
      type: 'workflow_start',
      executionId,
      data: { workflowName: workflow.name, triggerType },
    });

    try {
      this.log(context, 'info', `开始执行工作流: ${workflow.name}`);

      const startNodes = workflow.nodes.filter(node => node.type === 'trigger');

      if (startNodes.length === 0) {
        throw new Error('工作流没有触发器节点');
      }

      for (const startNode of startNodes) {
        await this.executeNode(workflow, startNode, context);
      }

      execution.status = 'success';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.variables = variableCtx.snapshot();

      this.tracer.record({
        type: 'workflow_complete',
        executionId,
        data: { duration: execution.duration },
      });

      this.log(context, 'info', `工作流执行完成，耗时: ${execution.duration}ms`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.error = errorMsg;
      execution.variables = variableCtx.snapshot();

      this.tracer.record({
        type: 'workflow_failed',
        executionId,
        message: errorMsg,
      });

      this.log(context, 'error', `工作流执行失败: ${errorMsg}`);
      logger.error('[WorkflowExecutor] 执行失败:', { workflowId: workflow.id, error: errorMsg });
    } finally {
      this.activeExecutions--;
      execution.logs = context.logs;
      execution.nodeExecutions = context.nodeExecutions;
      const rc = this.runControllers.get(executionId);
      if (rc) {
        abortPrimitives.release(`run:${rc.runId}`);
        this.runControllers.delete(executionId);
      }
    }

    return executionId;
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<void> {
    if (node.enabled === false) {
      this.log(context, 'info', `节点已禁用，跳过: ${node.name}`, node.id);
      await this.executeConnectedNodes(workflow, node, context);
      return;
    }

    await this.checkBreakpoint(context.executionId, node);

    const pauseState = this.pauseStates.get(context.executionId);
    if (pauseState?.isPaused) {
      await this.waitForResume(context.executionId);
    }

    const variableCtx = this.variableContexts.get(context.executionId)!;

    const startTime = Date.now();
    const nodeExecution: NodeExecutionRecord = {
      nodeId: node.id,
      nodeName: node.name,
      status: 'running',
      startTime,
      input: variableCtx.snapshot(),
    };

    context.nodeExecutions.push(nodeExecution);
    this.log(context, 'info', `开始执行节点: ${node.name}`, node.id);

    this.tracer.record({
      type: 'node_start',
      executionId: context.executionId,
      nodeId: node.id,
      nodeName: node.name,
    });

    try {
      const timeout = node.timeout || 0;
      let output: Record<string, unknown>;

      if (timeout > 0) {
        output = await this.executeWithTimeout(
          () => this.executeNodeByType(workflow, node, context, variableCtx),
          timeout,
          `节点执行超时: ${node.name}`
        );
      } else {
        output = await this.executeNodeByType(workflow, node, context, variableCtx);
      }

      context.nodeOutputs.set(node.id, output);
      variableCtx.merge(output);
      context.variables = variableCtx.snapshot();

      nodeExecution.status = 'success';
      nodeExecution.endTime = Date.now();
      nodeExecution.duration = nodeExecution.endTime - nodeExecution.startTime;
      nodeExecution.output = output;

      this.tracer.record({
        type: 'node_complete',
        executionId: context.executionId,
        nodeId: node.id,
        nodeName: node.name,
        data: { duration: nodeExecution.duration },
      });

      this.log(context, 'info', `节点执行完成: ${node.name}`, node.id);

      await this.executeConnectedNodes(workflow, node, context, variableCtx);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.tracer.record({
        type: 'node_failed',
        executionId: context.executionId,
        nodeId: node.id,
        nodeName: node.name,
        message: errorMsg,
      });

      const retryCount = await this.handleRetry(workflow, node, context, variableCtx, error);
      if (retryCount > 0) {
        nodeExecution.retryCount = retryCount;
        nodeExecution.status = 'success';
        this.log(context, 'info', `节点重试成功: ${node.name}`, node.id);
      } else {
        nodeExecution.status = 'failed';
        nodeExecution.endTime = Date.now();
        nodeExecution.duration = nodeExecution.endTime - nodeExecution.startTime;
        nodeExecution.error = errorMsg;

        this.log(context, 'error', `节点执行失败: ${errorMsg}`, node.id);
        throw error;
      }
    }
  }

  /**
   * 根据节点类型执行
   */
  private async executeNodeByType(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    switch (node.type) {
      case 'trigger':
        return this.executeTrigger(node, context);
      case 'condition':
        return this.executeCondition(workflow, node, context, variableCtx);
      case 'action':
        return this.executeAction(node, context);
      case 'parallel':
        return this.executeParallel(workflow, node, context, variableCtx);
      case 'loop':
        return this.executeLoop(workflow, node, context, variableCtx);
      case 'wait':
        return this.executeWait(node, context, variableCtx);
      case 'delay':
        return this.executeDelay(node, context, variableCtx);
      case 'script':
        return this.executeScriptNode(node, context, variableCtx);
      case 'transform':
        return this.executeTransform(node, variableCtx);
      case 'merge':
        return this.executeMerge(node, context, variableCtx);
      case 'switch':
        return this.executeSwitch(workflow, node, context, variableCtx);
      case 'subworkflow':
        return this.executeSubWorkflow(node, context, variableCtx);
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMsg: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMsg));
      }, timeoutMs);

      fn().then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * 执行触发器节点
   */
  private async executeTrigger(
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    this.log(context, 'info', `触发器激活: ${node.name}`, node.id);
    return { triggered: true, triggerType: context.triggerType };
  }

  /**
   * 执行条件节点
   */
  private async executeCondition(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as ConditionConfig;
    const result = this.evaluateCondition(config, variableCtx);

    this.log(context, 'info', `条件评估结果: ${result}`, node.id);

    if (config.branches) {
      const targetNodeId = result ? config.branches.true : config.branches.false;
      const targetNode = workflow.nodes.find(n => n.id === targetNodeId);

      if (targetNode) {
        await this.executeNode(workflow, targetNode, context);
      }
    }

    return { conditionResult: result };
  }

  /**
   * 执行动作节点
   */
  private async executeAction(
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as ActionConfig;
    const timeout = node.timeout || 30000;

    this.log(context, 'info', `执行动作: ${node.name} (type: ${config.type})`, node.id);

    let result: Record<string, unknown>;

    switch (config.type) {
      case 'ai_call':
        result = await this.executeAICall(config, context);
        break;
      case 'tool_execution':
        result = await this.executeToolCall(config, context);
        break;
      case 'notification':
        result = await this.executeNotification(config, context);
        break;
      case 'data_transform':
        result = await this.executeDataTransform(config, context);
        break;
      case 'api_call':
        result = await this.executeApiCall(config, context);
        break;
      case 'script':
        result = await this.executeScript(config, context);
        break;
      default:
        throw new Error(`未知动作类型: ${config.type}`);
    }

    this.log(context, 'info', `动作执行完成: ${node.name}`, node.id);
    return result;
  }

  /**
   * 执行 AI 调用
   */
  private async executeAICall(
    config: ActionConfig,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const { prompt, modelId, systemPrompt } = config.params;
    if (!prompt) {
      throw new Error('AI 调用缺少 prompt 参数');
    }

    try {
      const messages: Array<{ role: string; content: string }> = [
        systemPrompt ? { role: 'system', content: String(systemPrompt) } : null,
        { role: 'user', content: String(prompt) },
      ].filter(Boolean) as Array<{ role: string; content: string }>;

      const response = await callAIModel(
        { id: modelId as string || 'default', provider: 'default', maxTokens: 4096 },
        messages
      );

      return {
        actionExecuted: true,
        actionType: 'ai_call',
        result: response,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(context, 'error', `AI 调用失败: ${errorMsg}`, config.type);
      throw new Error(`AI 调用失败: ${errorMsg}`);
    }
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    config: ActionConfig,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const { toolName, arguments: args } = config.params;
    if (!toolName) {
      throw new Error('工具调用缺少 toolName 参数');
    }

    const strToolName = String(toolName);
    const effectiveToolName = toolFallbackManager.checkAndFallback(strToolName);
    const strArgs = args as Record<string, unknown> || {};
    const execStartTime = Date.now();
    let retryCount = 0;
    const receiptId = uuidv4();

    toolSendReceipts.createReceipt({
      id: receiptId,
      toolName: effectiveToolName,
      sessionId: context.sessionId || 'workflow',
      arguments: JSON.stringify(strArgs),
    });

    const toolExecutor = async (_signal: AbortSignal): Promise<string> => {
      return executeToolCallFromRegistry({
        id: uuidv4(),
        type: 'function',
        function: {
          name: effectiveToolName,
          arguments: JSON.stringify(strArgs),
        },
      });
    };

    const rc = context.executionId ? this.runControllers.get(context.executionId) : undefined;
    const managedSignal = rc?.controller.signal;

    try {
      const retryResult = await executeToolCallWithRetry(effectiveToolName, () =>
        toolExecutionQueue.enqueue(
          {
            id: uuidv4(),
            toolName: effectiveToolName,
            args: strArgs,
            priority: 'normal',
            sessionId: context.sessionId,
            enqueuedAt: Date.now(),
            signal: managedSignal,
          },
          (queueSignal: AbortSignal) =>
            executeToolCallWithTimeout(effectiveToolName, toolExecutor, { signal: queueSignal }),
        ),
        {}, managedSignal,
      );
      let result = retryResult.result;
      retryCount = retryResult.retryCount;

      const middlewareResult = executeToolCallWithMiddleware(effectiveToolName, result);
      result = middlewareResult.content;

      result = guardToolResultContext(result, [{ role: 'system', content: JSON.stringify(context.variables) }], 128000);

      toolExecutionStats.record({
        toolName: effectiveToolName,
        startTime: execStartTime,
        endTime: Date.now(),
        success: middlewareResult.errorType === 'none',
        errorType: middlewareResult.errorType === 'none' ? undefined : middlewareResult.errorType,
        errorMessage: middlewareResult.errorMessage,
        retryCount,
        timedOut: false,
        resultSize: result.length,
      });

      toolAuditLog.log({
        toolName: effectiveToolName,
        originalToolName: effectiveToolName !== strToolName ? strToolName : undefined,
        sessionId: context.sessionId,
        args: strArgs,
        result: result.slice(0, 500),
        success: middlewareResult.errorType === 'none',
        durationMs: Date.now() - execStartTime,
        errorType: middlewareResult.errorType === 'none' ? undefined : middlewareResult.errorType,
        truncated: middlewareResult.truncated,
      });

      if (middlewareResult.errorType === 'none') {
        toolSendReceipts.completeReceipt(receiptId, result, retryCount);
      } else {
        toolSendReceipts.failReceipt(receiptId, middlewareResult.errorMessage || 'Unknown error', retryCount);
      }

      return {
        actionExecuted: true,
        actionType: 'tool_execution',
        result,
        toolName: strToolName,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      toolSendReceipts.failReceipt(receiptId, errorMsg, retryCount);

      toolExecutionStats.record({
        toolName: effectiveToolName,
        startTime: execStartTime,
        endTime: Date.now(),
        success: false,
        errorType: 'permanent',
        errorMessage: errorMsg,
        retryCount,
        timedOut: false,
        resultSize: 0,
      });
      toolAuditLog.log({
        toolName: effectiveToolName,
        originalToolName: effectiveToolName !== strToolName ? strToolName : undefined,
        sessionId: context.sessionId,
        args: strArgs,
        result: errorMsg.slice(0, 500),
        success: false,
        durationMs: Date.now() - execStartTime,
        errorType: 'permanent',
        truncated: false,
      });

      this.log(context, 'error', `工具调用失败: ${errorMsg}`, config.type);
      throw new Error(`工具调用失败: ${errorMsg}`);
    }
  }

  /**
   * 执行通知
   */
  private async executeNotification(
    config: ActionConfig,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const { title, message, type } = config.params;
    if (!title || !message) {
      throw new Error('通知缺少 title 或 message 参数');
    }

    try {
      await sendNotification({
        title: String(title),
        body: String(message),
        type: (type as string) || 'info',
      });

      return {
        actionExecuted: true,
        actionType: 'notification',
        result: '通知已发送',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(context, 'warn', `通知发送失败: ${errorMsg}`, config.type);
      return {
        actionExecuted: false,
        actionType: 'notification',
        result: '通知发送失败',
        error: errorMsg,
      };
    }
  }

  /**
   * 执行数据转换
   */
  private async executeDataTransform(
    config: ActionConfig,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const { input, transform } = config.params;
    if (!input || !transform) {
      throw new Error('数据转换缺少 input 或 transform 参数');
    }

    try {
      const variableCtx = this.variableContexts.get(context.executionId)!;
      const result = this.applyTransform(input, transform, variableCtx);
      return {
        actionExecuted: true,
        actionType: 'data_transform',
        result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(context, 'error', `数据转换失败: ${errorMsg}`, config.type);
      throw new Error(`数据转换失败: ${errorMsg}`);
    }
  }

  /**
   * 执行 API 调用
   */
  private async executeApiCall(
    config: ActionConfig,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const { url, method, headers, body } = config.params;
    if (!url || !method) {
      throw new Error('API 调用缺少 url 或 method 参数');
    }

    try {
      const response = await fetch(String(url), {
        method: String(method),
        headers: headers as Record<string, string> || {},
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();
      return {
        actionExecuted: true,
        actionType: 'api_call',
        status: response.status,
        result: data,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(context, 'error', `API 调用失败: ${errorMsg}`, config.type);
      throw new Error(`API 调用失败: ${errorMsg}`);
    }
  }

  /**
   * 执行脚本
   */
  private async executeScript(
    config: ActionConfig,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const { script, language } = config.params;
    if (!script) {
      throw new Error('脚本执行缺少 script 参数');
    }

    try {
      const variableCtx = this.variableContexts.get(context.executionId)!;
      const result = this.executeScriptCode(String(script), language as string, variableCtx);
      return {
        actionExecuted: true,
        actionType: 'script',
        result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(context, 'error', `脚本执行失败: ${errorMsg}`, config.type);
      throw new Error(`脚本执行失败: ${errorMsg}`);
    }
  }

  /**
   * 应用数据转换
   */
  private applyTransform(
    input: unknown,
    transform: unknown,
    variableCtx: VariableContext
  ): unknown {
    if (typeof transform === 'object' && transform !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(transform as Record<string, unknown>)) {
        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
          const expr = value.slice(2, -2).trim();
          result[key] = variableCtx.evaluate(expr) ?? this.evaluateExpression(expr, { input, ...variableCtx.snapshot() });
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.applyTransform(value, value, variableCtx);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return input;
  }

  /**
   * 评估表达式
   */
  private evaluateExpression(
    expr: string,
    context: Record<string, unknown>
  ): unknown {
    try {
      const keys = Object.keys(context);
      const values = keys.map(k => context[k]);
      const fn = new Function(...keys, `return ${expr};`);
      return fn(...values);
    } catch {
      return context[expr] ?? expr;
    }
  }

  /**
   * 执行脚本代码
   */
  private executeScriptCode(
    script: string,
    language: string,
    variableCtx: VariableContext
  ): unknown {
    if (language === 'javascript' || !language) {
      const variablesObj = variableCtx.snapshot();
      const keys = Object.keys(variablesObj);
      const values = keys.map(k => variablesObj[k]);
      const fn = new Function(...keys, script);
      return fn(...values);
    }
    throw new Error(`不支持的脚本语言: ${language}`);
  }

  /**
   * 执行并行节点（支持 maxConcurrency）
   */
  private async executeParallel(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as ParallelConfigExt;
    this.log(context, 'info', `并行执行 ${config.branches.length} 个分支`, node.id);

    const branchNodes = config.branches.map(branchNodeId => {
      const branchNode = workflow.nodes.find(n => n.id === branchNodeId);
      if (!branchNode) {
        throw new Error(`找不到分支节点: ${branchNodeId}`);
      }
      return branchNode;
    });

    const maxConcurrency = config.maxConcurrency || 0;

    if (maxConcurrency > 0 && maxConcurrency < branchNodes.length) {
      await this.executeWithConcurrencyLimit(workflow, branchNodes, context, maxConcurrency);
    } else {
      const promises = branchNodes.map(async (branchNode) => {
        await this.executeNode(workflow, branchNode, context);
      });

      switch (config.mode) {
        case 'all':
          await Promise.all(promises);
          break;
        case 'any':
          await Promise.any(promises);
          break;
        case 'race':
          await Promise.race(promises);
          break;
      }
    }

    return { parallelExecuted: true, mode: config.mode, branchCount: config.branches.length };
  }

  /**
   * 带并发限制的执行
   */
  private async executeWithConcurrencyLimit(
    workflow: Workflow,
    nodes: WorkflowNode[],
    context: ExecutionContext,
    maxConcurrency: number
  ): Promise<void> {
    const results: Promise<void>[] = [];
    const executing = new Set<Promise<void>>();

    for (const node of nodes) {
      const promise = this.executeNode(workflow, node, context).then(() => {
        executing.delete(promise);
      });
      results.push(promise);
      executing.add(promise);

      if (executing.size >= maxConcurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(results);
  }

  /**
   * 执行循环节点
   */
  private async executeLoop(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as LoopConfig;
    const iteratorData = variableCtx.get(config.iteratorSource) as unknown[];
    const maxIterations = config.maxIterations || 100;

    if (!Array.isArray(iteratorData)) {
      throw new Error('循环数据源必须是数组');
    }

    this.log(context, 'info', `循环执行 ${iteratorData.length} 次`, node.id);

    const bodyNode = workflow.nodes.find(n => n.id === config.bodyNodeId);
    if (!bodyNode) {
      throw new Error(`找不到循环体节点: ${config.bodyNodeId}`);
    }

    const results: unknown[] = [];
    const iterations = Math.min(iteratorData.length, maxIterations);

    for (let i = 0; i < iterations; i++) {
      const item = iteratorData[i];
      variableCtx.set(config.iteratorVariable, item);
      context.variables = variableCtx.snapshot();

      await this.executeNode(workflow, bodyNode, context);
      const bodyOutput = context.nodeOutputs.get(config.bodyNodeId);
      if (bodyOutput) {
        results.push(bodyOutput);
      }
    }

    return { loopExecuted: true, iterations, results };
  }

  /**
   * 执行等待节点
   */
  private async executeWait(
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config;

    if (config.type === 'duration' && config.duration) {
      const duration = typeof config.duration === 'number'
        ? config.duration
        : Number(variableCtx.evaluate(String(config.duration)));
      this.log(context, 'info', `等待 ${duration}ms`, node.id);
      await new Promise(resolve => setTimeout(resolve, duration));
    } else if (config.type === 'event' && config.event) {
      this.log(context, 'info', `等待事件: ${config.event}`, node.id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else if (config.type === 'condition' && config.condition) {
      this.log(context, 'info', `等待条件满足: ${config.condition}`, node.id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { waitComplete: true };
  }

  // ===================== 新增节点类型实现 =====================

  /**
   * 执行延迟节点
   */
  private async executeDelay(
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as DelayConfig;
    let duration = config.duration;

    if (config.durationExpression) {
      const evaluated = variableCtx.evaluate(config.durationExpression);
      duration = Number(evaluated) || 0;
    }

    if (duration < 0) duration = 0;

    this.log(context, 'info', `延迟等待 ${duration}ms`, node.id);
    await new Promise(resolve => setTimeout(resolve, duration));

    return { delayComplete: true, duration };
  }

  /**
   * 执行脚本节点
   */
  private async executeScriptNode(
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as ScriptConfig;
    if (!config.code) {
      throw new Error('脚本节点缺少代码');
    }

    this.log(context, 'info', `执行脚本节点: ${node.name}`, node.id);

    const timeout = config.timeout || node.timeout || 30000;
    const result = await this.executeWithTimeout(
      () => Promise.resolve(this.executeScriptCode(config.code, config.language, variableCtx)),
      timeout,
      `脚本执行超时: ${node.name}`
    );

    return {
      scriptExecuted: true,
      result,
    };
  }

  /**
   * 执行数据转换节点
   */
  private executeTransform(
    node: WorkflowNode,
    variableCtx: VariableContext
  ): Record<string, unknown> {
    const config = node.config as unknown as TransformConfig;
    const result: Record<string, unknown> = {};

    for (const mapping of config.mappings) {
      let value: unknown;

      if (mapping.source.startsWith('{{') && mapping.source.endsWith('}}')) {
        const expr = mapping.source.slice(2, -2).trim();
        value = variableCtx.evaluate(expr);
      } else {
        value = variableCtx.get(mapping.source);
      }

      if (value === undefined && mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      }

      if (mapping.transform && value !== undefined && value !== null) {
        value = this.applyTransformFunction(value, mapping.transform);
      }

      result[mapping.target] = value;
    }

    if (config.outputVariable) {
      variableCtx.set(config.outputVariable, result);
      return { [config.outputVariable]: result, transformComplete: true };
    }

    return { ...result, transformComplete: true };
  }

  /**
   * 应用转换函数
   */
  private applyTransformFunction(value: unknown, transform: string): unknown {
    const str = String(value);
    switch (transform) {
      case 'uppercase':
        return str.toUpperCase();
      case 'lowercase':
        return str.toLowerCase();
      case 'trim':
        return str.trim();
      case 'number':
        return Number(value);
      case 'string':
        return String(value);
      case 'boolean':
        return Boolean(value);
      case 'json_parse':
        try {
          return JSON.parse(str);
        } catch {
          return value;
        }
      case 'json_stringify':
        try {
          return JSON.stringify(value);
        } catch {
          return str;
        }
      default:
        return value;
    }
  }

  /**
   * 执行合并节点
   */
  private async executeMerge(
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as MergeConfig;
    const executionId = context.executionId;
    const mergeKey = `${executionId}:${node.id}`;

    if (!this.mergeNodeInputs.has(mergeKey)) {
      this.mergeNodeInputs.set(mergeKey, new Map());
    }
    const inputs = this.mergeNodeInputs.get(mergeKey)!;

    const callerNodeId = this.findCallerNodeId(context, node);
    if (callerNodeId) {
      const nodeOutput = context.nodeOutputs.get(callerNodeId) || {};
      inputs.set(callerNodeId, nodeOutput);
    }

    if (config.mode === 'first') {
      const firstInput = inputs.values().next().value || {};
      this.mergeNodeInputs.delete(mergeKey);
      return { merged: true, mode: 'first', data: firstInput };
    }

    if (config.mode === 'any') {
      const merged = this.mergeInputs(inputs, config.mergeStrategy || 'assign');
      return { merged: true, mode: 'any', data: merged };
    }

    const expectedCount = config.inputCount || this.countIncomingConnections(context, node);
    if (inputs.size < expectedCount) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (inputs.size >= expectedCount) {
            clearInterval(checkInterval);
            const merged = this.mergeInputs(inputs, config.mergeStrategy || 'assign');
            this.mergeNodeInputs.delete(mergeKey);
            resolve({ merged: true, mode: 'all', data: merged, inputCount: inputs.size });
          }
        }, 50);
      });
    }

    const merged = this.mergeInputs(inputs, config.mergeStrategy || 'assign');
    this.mergeNodeInputs.delete(mergeKey);
    return { merged: true, mode: 'all', data: merged, inputCount: inputs.size };
  }

  /**
   * 合并输入数据
   */
  private mergeInputs(
    inputs: Map<string, Record<string, unknown>>,
    strategy: string
  ): Record<string, unknown> {
    const inputArray = Array.from(inputs.values());

    switch (strategy) {
      case 'first':
        return { ...(inputArray[0] || {}) };
      case 'last':
        return { ...(inputArray[inputArray.length - 1] || {}) };
      case 'concat':
        const result: Record<string, unknown[]> = {};
        for (const input of inputArray) {
          const inputObj = input as Record<string, unknown>;
          for (const [key, value] of Object.entries(inputObj)) {
            if (!result[key]) {
              result[key] = [];
            }
            result[key].push(value);
          }
        }
        return result;
      case 'assign':
      default:
        return Object.assign({}, ...inputArray);
    }
  }

  /**
   * 查找调用节点 ID
   */
  private findCallerNodeId(context: ExecutionContext, node: WorkflowNode): string | undefined {
    if (context.nodeExecutions.length < 2) return undefined;
    const lastExecution = context.nodeExecutions[context.nodeExecutions.length - 2];
    return lastExecution?.nodeId;
  }

  /**
   * 计算入站连接数
   */
  private countIncomingConnections(context: ExecutionContext, node: WorkflowNode): number {
    let count = 0;
    const workflow = this.getWorkflow(context);
    if (!workflow) return 1;

    for (const n of workflow.nodes) {
      for (const conn of n.connections || []) {
        if (conn.target === node.id) {
          count++;
        }
      }
    }
    return count || 1;
  }

  /**
   * 执行 Switch 多路分支节点
   */
  private async executeSwitch(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as SwitchConfig;
    const expressionValue = variableCtx.evaluate(config.expression);

    this.log(context, 'info', `Switch 节点表达式结果: ${expressionValue}`, node.id);

    const matchedCase = config.cases.find(c => c.value === expressionValue);
    const targetNodeId = matchedCase?.targetNodeId || config.defaultTargetNodeId;

    if (targetNodeId) {
      const targetNode = workflow.nodes.find(n => n.id === targetNodeId);
      if (targetNode) {
        await this.executeNode(workflow, targetNode, context);
      }
    }

    return {
      switchComplete: true,
      expressionValue,
      matched: matchedCase?.value ?? null,
    };
  }

  /**
   * 执行子工作流节点
   */
  private async executeSubWorkflow(
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as SubWorkflowConfig;
    if (!config.workflowId) {
      throw new Error('子工作流节点缺少工作流 ID');
    }

    this.log(context, 'info', `调用子工作流: ${config.workflowId}`, node.id);

    let subWorkflow: Workflow | null = null;
    for (const loader of this.subWorkflowLoaders.values()) {
      subWorkflow = await loader(config.workflowId);
      if (subWorkflow) break;
    }

    if (!subWorkflow) {
      throw new Error(`找不到子工作流: ${config.workflowId}`);
    }

    const subVariables: Record<string, unknown> = {};
    if (config.inputMappings) {
      for (const mapping of config.inputMappings) {
        const value = variableCtx.get(mapping.source);
        subVariables[mapping.target] = value;
      }
    }

    if (config.async) {
      this.execute(subWorkflow, 'manual', undefined, subVariables).catch(err => {
        logger.error('[WorkflowExecutor] 异步子工作流执行失败:', err);
      });
      return {
        subWorkflowStarted: true,
        workflowId: config.workflowId,
        async: true,
      };
    }

    const subExecutionId = await this.execute(subWorkflow, 'manual', undefined, subVariables);
    const subExecution = this.getExecution(subExecutionId);
    const subResult: Record<string, unknown> = {
      subWorkflowCompleted: true,
      workflowId: config.workflowId,
      async: false,
      executionId: subExecutionId,
      status: subExecution?.status,
    };

    if (subExecution) {
      const subVarCtx = this.variableContexts.get(subExecutionId);
      if (subVarCtx && config.outputMappings) {
        for (const mapping of config.outputMappings) {
          const value = subVarCtx.get(mapping.source);
          variableCtx.set(mapping.target, value);
          subResult[mapping.target] = value;
        }
      }
    }

    return subResult;
  }

  // ===================== 连接节点执行 =====================

  /**
   * 执行连接的后续节点
   */
  private async executeConnectedNodes(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx?: VariableContext
  ): Promise<void> {
    for (const connection of node.connections) {
      if (connection.source === node.id) {
        const targetNode = workflow.nodes.find(n => n.id === connection.target);
        if (targetNode && targetNode.type !== 'trigger') {
          if (connection.condition && variableCtx) {
            const condResult = variableCtx.evaluate(connection.condition);
            if (!condResult) continue;
          }
          await this.executeNode(workflow, targetNode, context);
        }
      }
    }
  }

  /**
   * 评估条件
   */
  evaluateCondition(
    config: ConditionConfig,
    variableCtx: VariableContext | Record<string, unknown>
  ): boolean {
    const variables = variableCtx instanceof VariableContext
      ? variableCtx
      : new VariableContext(variableCtx);

    const results = config.conditions.map(condition => {
      const variableValue = variables.get(condition.variable);

      switch (condition.operator) {
        case 'equals':
          return variableValue === condition.value;
        case 'not_equals':
          return variableValue !== condition.value;
        case 'contains':
          return String(variableValue).includes(String(condition.value));
        case 'greater_than':
          return Number(variableValue) > Number(condition.value);
        case 'less_than':
          return Number(variableValue) < Number(condition.value);
        case 'exists':
          return variableValue !== undefined && variableValue !== null;
        case 'not_exists':
          return variableValue === undefined || variableValue === null;
        default:
          return false;
      }
    });

    return config.logic === 'and'
      ? results.every(r => r)
      : results.some(r => r);
  }

  /**
   * 处理重试逻辑
   */
  private async handleRetry(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext,
    variableCtx: VariableContext,
    error: unknown
  ): Promise<number> {
    const retryPolicy = node.retryPolicy;
    if (!retryPolicy || retryPolicy.maxRetries === 0) {
      return 0;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    this.log(context, 'warn', `节点执行失败，准备重试: ${errorMsg}`, node.id);

    let retryCount = 0;
    let lastError = error;

    while (retryCount < retryPolicy.maxRetries) {
      retryCount++;
      const delay = retryPolicy.exponentialBackoff
        ? retryPolicy.retryDelay * Math.pow(2, retryCount - 1)
        : retryPolicy.retryDelay;

      this.log(context, 'info', `重试 ${retryCount}/${retryPolicy.maxRetries}，延迟 ${delay}ms`, node.id);

      this.tracer.record({
        type: 'node_retry',
        executionId: context.executionId,
        nodeId: node.id,
        nodeName: node.name,
        data: { retryCount, delay },
      });

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const output = await this.executeNodeByType(workflow, node, context, variableCtx);

        context.nodeOutputs.set(node.id, output);
        variableCtx.merge(output);
        context.variables = variableCtx.snapshot();

        this.log(context, 'info', `节点重试成功: ${node.name}`, node.id);
        return retryCount;
      } catch (err) {
        lastError = err;
        this.log(context, 'warn', `重试 ${retryCount} 失败: ${err instanceof Error ? err.message : String(err)}`, node.id);
      }
    }

    throw lastError;
  }

  private getWorkflow(context: ExecutionContext): Workflow | null {
    const exec = this.executions.get(context.executionId);
    if (!exec) {
      return null;
    }
    return { id: exec.workflowId, name: exec.workflowName } as Workflow;
  }

  /**
   * 记录日志
   */
  private log(
    context: ExecutionContext,
    level: 'info' | 'warn' | 'error',
    message: string,
    nodeId?: string
  ): void {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      nodeId,
    };

    context.logs.push(logEntry);

    const logMessage = `[WorkflowExecutor] ${message}`;
    switch (level) {
      case 'info':
        logger.info(logMessage);
        break;
      case 'warn':
        logger.warn(logMessage);
        break;
      case 'error':
        logger.error(logMessage);
        break;
    }
  }

  /**
   * 获取执行记录
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 获取所有执行记录
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * 取消执行
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      const rc = this.runControllers.get(executionId);
      if (rc) {
        abortPrimitives.abort(`run:${rc.runId}`, {
          reason: 'user_cancel',
          source: 'cancelExecution',
          timestamp: Date.now(),
          message: `Workflow execution ${executionId} cancelled`,
        });
      }

      const resolver = this.pauseResolvers.get(executionId);
      if (resolver) {
        resolver();
        this.pauseResolvers.delete(executionId);
      }

      logger.info(`[WorkflowExecutor] 执行已取消: ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * 清理执行记录
   */
  cleanupExecutions(olderThan: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - olderThan;
    let cleaned = 0;

    for (const [id, execution] of this.executions.entries()) {
      if (execution.endTime && execution.endTime < cutoffTime) {
        this.executions.delete(id);
        this.variableContexts.delete(id);
        this.breakpoints.delete(id);
        this.pauseStates.delete(id);
        cleaned++;
      }
    }

    logger.info(`[WorkflowExecutor] 已清理 ${cleaned} 条执行记录`);
    return cleaned;
  }
}

export const workflowExecutor = new WorkflowExecutor();
