/**
 * Execution Engine — 执行引擎
 *
 * 多步骤执行编排引擎，支持：
 * - 顺序执行步骤
 * - 步骤重试
 * - 步骤超时
 * - 暂停/恢复
 * - 并行执行
 * - 事件通知
 *
 * 使用方式：
 *   const engine = new ExecutionEngine();
 *   engine.registerTool({ name: 'echo', executor: async (_, args) => args });
 *   const result = await engine.execute([
 *     { id: 's1', type: 'tool_call', name: 'Echo', toolName: 'echo', toolArgs: { msg: 'hello' } },
 *   ]);
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  ExecutionStep,
  ExecutionResult,
  StepResult,
  ExecutionContext,
  ExecutionConfig,
  ToolRegistration,
  ToolExecutor,
  ExecutionStatus,
  ExecutionEvent,
} from './types.js';

// ===================== ExecutionEngine 类 =====================

/**
 * 执行引擎
 */
export class ExecutionEngine extends EventEmitter {
  private tools: Map<string, ToolRegistration>;
  private defaultConfig: ExecutionConfig;
  private activeExecutions: Map<string, ExecutionContext>;

  constructor(config?: ExecutionConfig) {
    super();
    this.setMaxListeners(100);
    this.tools = new Map();
    this.defaultConfig = {
      timeoutMs: 5 * 60 * 1000,
      maxRetries: 0,
      retryDelayMs: 1000,
      continueOnFailure: false,
      concurrency: 1,
      ...config,
    };
    this.activeExecutions = new Map();
  }

  // ===================== 工具注册 =====================

  /**
   * 注册工具
   */
  registerTool(registration: ToolRegistration): void {
    if (!registration.name) {
      throw new Error('工具必须有 name');
    }
    if (!registration.executor) {
      throw new Error(`工具 ${registration.name} 必须有 executor`);
    }
    this.tools.set(registration.name, { ...registration });
  }

  /**
   * 批量注册工具
   */
  registerTools(registrations: ToolRegistration[]): void {
    for (const reg of registrations) {
      this.registerTool(reg);
    }
  }

  /**
   * 取消注册工具
   */
  unregisterTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * 获取工具注册信息
   */
  getTool(toolName: string): ToolRegistration | undefined {
    return this.tools.get(toolName);
  }

  /**
   * 列出所有已注册工具
   */
  listTools(): ToolRegistration[] {
    return Array.from(this.tools.values());
  }

  /**
   * 检查工具是否已注册
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  // ===================== 执行入口 =====================

  /**
   * 执行步骤序列
   *
   * @param steps - 执行步骤列表
   * @param config - 执行配置（覆盖默认）
   * @param sessionId - 会话 ID
   * @returns 执行结果 Promise
   */
  async execute(
    steps: ExecutionStep[],
    config?: ExecutionConfig,
    sessionId?: string,
  ): Promise<ExecutionResult> {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('执行步骤列表不能为空');
    }

    const mergedConfig = { ...this.defaultConfig, ...config };
    const executionId = randomUUID();
    const startedAt = Date.now();

    const context: ExecutionContext = {
      executionId,
      sessionId,
      variables: new Map(),
      stepResults: new Map(),
      currentStepIndex: 0,
      isPaused: false,
      metadata: {},
    };

    this.activeExecutions.set(executionId, context);

    this.emitEvent('execution_started', executionId);

    const stepResults: StepResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let finalStatus: ExecutionStatus = 'completed';
    let finalError: string | undefined;
    let finalOutput: any;

    try {
      for (let i = 0; i < steps.length; i++) {
        context.currentStepIndex = i;

        if (context.abortSignal?.aborted) {
          finalStatus = 'cancelled';
          finalError = '执行被取消';
          break;
        }

        while (context.isPaused) {
          await sleep(50);
          if (context.abortSignal?.aborted) {
            finalStatus = 'cancelled';
            finalError = '执行被取消';
            break;
          }
        }
        if (finalStatus === 'cancelled') break;

        const step = steps[i];
        const stepResult = await this.executeStep(step, context, mergedConfig);
        stepResults.push(stepResult);
        context.stepResults.set(step.id, stepResult);

        if (stepResult.status === 'completed') {
          successCount++;
          finalOutput = stepResult.output;
        } else if (stepResult.status === 'failed') {
          failedCount++;
          if (step.critical !== false && !mergedConfig.continueOnFailure) {
            finalStatus = 'failed';
            finalError = stepResult.error;
            break;
          }
        } else if (stepResult.status === 'cancelled') {
          finalStatus = 'cancelled';
          finalError = stepResult.error;
          break;
        } else if (stepResult.status === 'timeout') {
          failedCount++;
          if (step.critical !== false && !mergedConfig.continueOnFailure) {
            finalStatus = 'failed';
            finalError = `步骤 ${step.name} 超时`;
            break;
          }
        } else {
          skippedCount++;
        }
      }
    } catch (err) {
      finalStatus = 'failed';
      finalError = err instanceof Error ? err.message : String(err);
    } finally {
      this.activeExecutions.delete(executionId);
    }

    const endedAt = Date.now();
    const totalDurationMs = endedAt - startedAt;

    const result: ExecutionResult = {
      executionId,
      status: finalStatus,
      stepResults,
      successCount,
      failedCount,
      skippedCount,
      startedAt,
      endedAt,
      totalDurationMs,
      error: finalError,
      finalOutput,
    };

    const eventType =
      finalStatus === 'completed'
        ? 'execution_completed'
        : finalStatus === 'cancelled'
          ? 'execution_cancelled'
          : 'execution_failed';

    this.emitEvent(eventType, executionId, result);

    return result;
  }

  // ===================== 执行控制 =====================

  /**
   * 暂停执行
   */
  pause(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context) return false;
    if (context.isPaused) return false;
    context.isPaused = true;
    this.emitEvent('paused', executionId);
    return true;
  }

  /**
   * 恢复执行
   */
  resume(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context) return false;
    if (!context.isPaused) return false;
    context.isPaused = false;
    this.emitEvent('resumed', executionId);
    return true;
  }

  /**
   * 取消执行
   */
  cancel(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context) return false;
    if (context.abortSignal) {
      (context as any).abortController?.abort?.();
    }
    return true;
  }

  /**
   * 获取执行上下文
   */
  getExecution(executionId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * 列出活跃执行
   */
  listActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): ExecutionConfig {
    return { ...this.defaultConfig };
  }

  /**
   * 更新默认配置
   */
  setDefaultConfig(config: Partial<ExecutionConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  // ===================== 内部：单步骤执行 =====================

  private async executeStep(
    step: ExecutionStep,
    context: ExecutionContext,
    config: ExecutionConfig,
  ): Promise<StepResult> {
    const startedAt = Date.now();
    const maxRetries = step.maxRetries ?? config.maxRetries ?? 0;
    const retryDelayMs = step.retryDelayMs ?? config.retryDelayMs ?? 1000;
    const timeoutMs = step.timeoutMs ?? config.timeoutMs;

    this.emitEvent('step_started', context.executionId, { stepId: step.id, stepName: step.name });

    let lastError: string | undefined;
    let retries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        retries = attempt;
        this.emitEvent('step_retry', context.executionId, {
          stepId: step.id,
          attempt,
        });
        await sleep(retryDelayMs * attempt);
      }

      try {
        const output = await this.executeStepWithTimeout(step, context, timeoutMs);

        const endedAt = Date.now();
        const result: StepResult = {
          stepId: step.id,
          stepName: step.name,
          status: 'completed',
          output,
          retries,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
        };

        this.emitEvent('step_completed', context.executionId, result);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);

        if (err instanceof Error && err.name === 'TimeoutError') {
          const endedAt = Date.now();
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'timeout',
            error: lastError,
            retries,
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
          };
        }

        if (attempt >= maxRetries) {
          break;
        }
      }
    }

    const endedAt = Date.now();
    const result: StepResult = {
      stepId: step.id,
      stepName: step.name,
      status: 'failed',
      error: lastError,
      retries,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
    };

    this.emitEvent('step_failed', context.executionId, result);
    return result;
  }

  private async executeStepWithTimeout(
    step: ExecutionStep,
    context: ExecutionContext,
    timeoutMs?: number,
  ): Promise<any> {
    if (step.type === 'tool_call') {
      return this.executeToolCall(step, context, timeoutMs);
    }

    if (step.type === 'parallel' && step.children) {
      return this.executeParallel(step.children, context, timeoutMs);
    }

    throw new Error(`不支持的步骤类型: ${step.type}`);
  }

  private async executeToolCall(
    step: ExecutionStep,
    context: ExecutionContext,
    timeoutMs?: number,
  ): Promise<any> {
    if (!step.toolName) {
      throw new Error(`步骤 ${step.name} 缺少 toolName`);
    }

    const tool = this.tools.get(step.toolName);
    if (!tool) {
      throw new Error(`未注册的工具: ${step.toolName}`);
    }

    const executor = tool.executor;
    const args = step.toolArgs ?? {};

    if (timeoutMs && timeoutMs > 0) {
      return withTimeout(
        () => executor(step.toolName!, args, context),
        timeoutMs,
        `工具 ${step.toolName} 执行超时`,
      );
    }

    return executor(step.toolName, args, context);
  }

  private async executeParallel(
    children: ExecutionStep[],
    context: ExecutionContext,
    _timeoutMs?: number,
  ): Promise<any[]> {
    const promises = children.map((child) =>
      this.executeStep(child, context, this.defaultConfig),
    );
    const results = await Promise.all(promises);
    return results.map((r) => r.output);
  }

  // ===================== 内部：事件 =====================

  private emitEvent(type: ExecutionEvent['type'], executionId: string, data?: any): void {
    const event: ExecutionEvent = {
      type,
      executionId,
      data,
      timestamp: Date.now(),
    };
    this.emit(type, event);
    this.emit('*', event);
  }
}

// ===================== 工具函数 =====================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(message);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ===================== 单例导出 =====================

const executionEngine = new ExecutionEngine();

export default executionEngine;
