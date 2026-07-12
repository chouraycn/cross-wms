/**
 * 工作流执行引擎
 * 支持异步执行、错误处理、重试和执行日志记录
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
 * 工作流执行器
 * 负责工作流的执行、节点调度、条件评估等核心逻辑
 */
export class WorkflowExecutor {
  private executions: Map<string, WorkflowExecution> = new Map();
  private maxConcurrentExecutions: number = 10;
  private activeExecutions: number = 0;
  /** v11.1: 执行 ID → run 级 AbortController，用于取消执行时中止工具调用 */
  private runControllers: Map<string, { runId: string; controller: ReturnType<typeof createRunAbortController> }> = new Map();

  /**
   * 执行工作流
   * @param workflow 工作流定义
   * @param triggerType 触发类型
   * @param triggeredBy 触发者
   * @param initialVariables 初始变量
   * @returns 执行记录 ID
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

    // 创建执行上下文
    const context: ExecutionContext = {
      workflowId: workflow.id,
      executionId,
      variables: { ...initialVariables },
      triggerType,
      triggeredBy,
      startTime,
      sessionId,
      nodeOutputs: new Map(),
      nodeExecutions: [],
      logs: [],
    };

    // 创建执行记录
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

    // v11.1: 创建 run 级 AbortController，用于取消执行时级联中止工具调用
    const runId = `wf-${executionId}`;
    const runController = createRunAbortController(runId);
    this.runControllers.set(executionId, { runId, controller: runController });

    try {
      this.log(context, 'info', `开始执行工作流: ${workflow.name}`);

      // 查找起始节点（通常是触发器节点）
      const startNodes = workflow.nodes.filter(node => node.type === 'trigger');

      if (startNodes.length === 0) {
        throw new Error('工作流没有触发器节点');
      }

      // 执行所有触发器节点
      for (const startNode of startNodes) {
        await this.executeNode(workflow, startNode, context);
      }

      // 标记执行完成
      execution.status = 'success';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      this.log(context, 'info', `工作流执行完成，耗时: ${execution.duration}ms`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.error = errorMsg;

      this.log(context, 'error', `工作流执行失败: ${errorMsg}`);
      logger.error('[WorkflowExecutor] 执行失败:', { workflowId: workflow.id, error: errorMsg });
    } finally {
      this.activeExecutions--;
      execution.logs = context.logs;
      // v11.1: 释放 run 级 AbortController（防止内存泄漏）
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
   * @param workflow 工作流定义
   * @param node 当前节点
   * @param context 执行上下文
   */
  private async executeNode(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<void> {
    const startTime = Date.now();
    const nodeExecution: NodeExecutionRecord = {
      nodeId: node.id,
      nodeName: node.name,
      status: 'running',
      startTime,
      input: context.variables,
    };

    context.nodeExecutions.push(nodeExecution);
    this.log(context, 'info', `开始执行节点: ${node.name}`, node.id);

    try {
      // 根据节点类型执行不同逻辑
      let output: Record<string, unknown> = {};

      switch (node.type) {
        case 'trigger':
          output = await this.executeTrigger(node, context);
          break;
        case 'condition':
          output = await this.executeCondition(workflow, node, context);
          break;
        case 'action':
          output = await this.executeAction(node, context);
          break;
        case 'parallel':
          output = await this.executeParallel(workflow, node, context);
          break;
        case 'loop':
          output = await this.executeLoop(workflow, node, context);
          break;
        case 'wait':
          output = await this.executeWait(node, context);
          break;
        default:
          throw new Error(`未知节点类型: ${node.type}`);
      }

      // 保存节点输出
      context.nodeOutputs.set(node.id, output);
      Object.assign(context.variables, output);

      // 标记节点执行成功
      nodeExecution.status = 'success';
      nodeExecution.endTime = Date.now();
      nodeExecution.duration = nodeExecution.endTime - nodeExecution.startTime;
      nodeExecution.output = output;

      this.log(context, 'info', `节点执行完成: ${node.name}`, node.id);

      // 执行后续连接的节点
      await this.executeConnectedNodes(workflow, node, context);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 尝试重试
      const retryCount = await this.handleRetry(node, context, error);
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
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as ConditionConfig;
    const result = this.evaluateCondition(config, context.variables);

    this.log(context, 'info', `条件评估结果: ${result}`, node.id);

    // 如果有分支配置，执行对应的分支
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
   * 执行工具调用（v11.1: 通过稳定性执行链）
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
    // v11.1: 降级检查 — 若主工具健康分过低，切换到备用工具
    const effectiveToolName = toolFallbackManager.checkAndFallback(strToolName);
    const strArgs = args as Record<string, unknown> || {};
    const execStartTime = Date.now();
    let retryCount = 0;
    const receiptId = uuidv4();

    // 创建工具发送回执
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

    // v11.1: 获取 run 级 managedSignal，传递给队列以支持取消
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

      // 结果中间件
      const middlewareResult = executeToolCallWithMiddleware(effectiveToolName, result);
      result = middlewareResult.content;

      // P1-2 修复：传入上下文变量估算大小，使累积保护生效
      result = guardToolResultContext(result, [{ role: 'system', content: JSON.stringify(context.variables) }], 128000);

      // 统计记录（使用 effectiveToolName，让健康分跟踪实际执行的工具）
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

      // 审计日志（记录原始工具名和实际执行的工具名，便于追踪降级）
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

      // 完成工具发送回执
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

      // 失败工具发送回执
      toolSendReceipts.failReceipt(receiptId, errorMsg, retryCount);

      // 失败也记录统计和审计
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
      const result = this.applyTransform(input, transform, context.variables);
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
      const result = this.executeScriptCode(String(script), language as string, context.variables);
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
    variables: Record<string, unknown>
  ): unknown {
    if (typeof transform === 'object' && transform !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(transform as Record<string, unknown>)) {
        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
          const expr = value.slice(2, -2).trim();
          result[key] = this.evaluateExpression(expr, { input, ...variables });
        } else {
          result[key] = this.applyTransform(value, value, variables);
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
    variables: Record<string, unknown>
  ): unknown {
    if (language === 'javascript' || !language) {
      const keys = Object.keys(variables);
      const values = keys.map(k => variables[k]);
      const fn = new Function(...keys, script);
      return fn(...values);
    }
    throw new Error(`不支持的脚本语言: ${language}`);
  }

  /**
   * 执行并行节点
   */
  private async executeParallel(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as ParallelConfig;
    this.log(context, 'info', `并行执行 ${config.branches.length} 个分支`, node.id);

    // 并行执行所有分支
    const promises = config.branches.map(async (branchNodeId) => {
      const branchNode = workflow.nodes.find(n => n.id === branchNodeId);
      if (!branchNode) {
        throw new Error(`找不到分支节点: ${branchNodeId}`);
      }
      await this.executeNode(workflow, branchNode, context);
    });

    // 根据模式等待结果
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

    return { parallelExecuted: true, mode: config.mode };
  }

  /**
   * 执行循环节点
   */
  private async executeLoop(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const config = node.config as unknown as LoopConfig;
    const iteratorData = context.variables[config.iteratorSource] as unknown[];
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
      context.variables[config.iteratorVariable] = item;

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
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const config = node.config;

    if (config.type === 'duration' && config.duration) {
      this.log(context, 'info', `等待 ${config.duration}ms`, node.id);
      await new Promise(resolve => setTimeout(resolve, config.duration as number));
    } else if (config.type === 'event' && config.event) {
      this.log(context, 'info', `等待事件: ${config.event}`, node.id);
      // 实际项目中需要实现事件等待机制
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else if (config.type === 'condition' && config.condition) {
      this.log(context, 'info', `等待条件满足: ${config.condition}`, node.id);
      // 实际项目中需要实现条件轮询机制
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { waitComplete: true };
  }

  /**
   * 执行连接的后续节点
   */
  private async executeConnectedNodes(
    workflow: Workflow,
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<void> {
    for (const connection of node.connections) {
      if (connection.source === node.id) {
        const targetNode = workflow.nodes.find(n => n.id === connection.target);
        if (targetNode && targetNode.type !== 'trigger') {
          await this.executeNode(workflow, targetNode, context);
        }
      }
    }
  }

  /**
   * 评估条件
   * @param config 条件配置
   * @param variables 变量集合
   * @returns 条件评估结果
   */
  evaluateCondition(
    config: ConditionConfig,
    variables: Record<string, unknown>
  ): boolean {
    const results = config.conditions.map(condition => {
      const variableValue = variables[condition.variable];

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
   * @param node 节点
   * @param context 执行上下文
   * @param error 错误
   * @returns 重试次数
   */
  private async handleRetry(
    node: WorkflowNode,
    context: ExecutionContext,
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

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        let output: Record<string, unknown> = {};

        switch (node.type) {
          case 'trigger':
            output = await this.executeTrigger(node, context);
            break;
          case 'condition':
            output = await this.executeCondition(this.getWorkflow(context), node, context);
            break;
          case 'action':
            output = await this.executeAction(node, context);
            break;
          case 'parallel':
            output = await this.executeParallel(this.getWorkflow(context), node, context);
            break;
          case 'loop':
            output = await this.executeLoop(this.getWorkflow(context), node, context);
            break;
          case 'wait':
            output = await this.executeWait(node, context);
            break;
          default:
            throw new Error(`未知节点类型: ${node.type}`);
        }

        context.nodeOutputs.set(node.id, output);
        Object.assign(context.variables, output);

        this.log(context, 'info', `节点重试成功: ${node.name}`, node.id);
        return retryCount;
      } catch (err) {
        lastError = err;
        this.log(context, 'warn', `重试 ${retryCount} 失败: ${err instanceof Error ? err.message : String(err)}`, node.id);
      }
    }

    throw lastError;
  }

  private getWorkflow(context: ExecutionContext): Workflow {
    const exec = this.executions.get(context.executionId);
    if (!exec) {
      throw new Error('找不到执行记录');
    }
    return { id: exec.workflowId, name: exec.workflowName } as Workflow;
  }

  /**
   * 记录日志
   * @param context 执行上下文
   * @param level 日志级别
   * @param message 日志消息
   * @param nodeId 节点 ID
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

    // 同时输出到系统日志
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
   * @param executionId 执行 ID
   * @returns 执行记录
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 获取所有执行记录
   * @returns 执行记录列表
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * 取消执行
   * @param executionId 执行 ID
   * @returns 是否成功取消
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      // v11.1: 中止 run 级 AbortController，级联取消正在执行的工具调用
      const rc = this.runControllers.get(executionId);
      if (rc) {
        abortPrimitives.abort(`run:${rc.runId}`, {
          reason: 'user_cancel',
          source: 'cancelExecution',
          timestamp: Date.now(),
          message: `Workflow execution ${executionId} cancelled`,
        });
      }

      logger.info(`[WorkflowExecutor] 执行已取消: ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * 清理执行记录
   * @param olderThan 清理超过指定时间的记录（毫秒）
   */
  cleanupExecutions(olderThan: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - olderThan;
    let cleaned = 0;

    for (const [id, execution] of this.executions.entries()) {
      if (execution.endTime && execution.endTime < cutoffTime) {
        this.executions.delete(id);
        cleaned++;
      }
    }

    logger.info(`[WorkflowExecutor] 已清理 ${cleaned} 条执行记录`);
    return cleaned;
  }
}

// 创建全局执行器实例
export const workflowExecutor = new WorkflowExecutor();