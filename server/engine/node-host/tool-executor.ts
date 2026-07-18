import { logger } from '../../logger.js';
import type {
  ToolDefinition,
  ToolHandler,
  ToolContext,
  ExecutionResult,
  ResourceUsage,
} from './types.js';
import { ToolRegistry } from './tool-registry.js';

type ToolExecutorOptions = {
  registry?: ToolRegistry;
  defaultTimeoutMs?: number;
  maxConcurrency?: number;
};

type RunningTool = {
  invocationId: string;
  toolName: string;
  abortController: AbortController;
  startTime: number;
};

export class ToolExecutor {
  private registry: ToolRegistry;
  private defaultTimeoutMs: number;
  private maxConcurrency: number;
  private runningTools: Map<string, RunningTool> = new Map();
  private runningCount = 0;
  private queue: Array<{
    invocationId: string;
    toolName: string;
    input: Record<string, unknown>;
    context: ToolContext;
    resolve: (result: ExecutionResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(options: ToolExecutorOptions = {}) {
    this.registry = options.registry ?? new ToolRegistry();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.maxConcurrency = options.maxConcurrency ?? 10;
  }

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ExecutionResult> {
    const invocationId = context.invocationId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    logger.debug(`[ToolExecutor] Executing tool: ${toolName}, invocation: ${invocationId}`);

    const entry = this.registry.get(toolName);
    if (!entry) {
      return this.buildErrorResult(invocationId, startTime, `Tool not found: ${toolName}`);
    }

    if (this.runningCount >= this.maxConcurrency) {
      return new Promise((resolve, reject) => {
        this.queue.push({ invocationId, toolName, input, context: { ...context, invocationId }, resolve, reject });
        logger.debug(`[ToolExecutor] Queued tool: ${toolName} (queue size: ${this.queue.length})`);
      });
    }

    return this.runTool(invocationId, toolName, entry.handler, input, { ...context, invocationId }, startTime);
  }

  private async runTool(
    invocationId: string,
    toolName: string,
    handler: ToolHandler,
    input: Record<string, unknown>,
    context: ToolContext,
    startTime: number,
  ): Promise<ExecutionResult> {
    const entry = this.registry.get(toolName);
    const timeoutMs = entry?.definition.timeoutMs ?? this.defaultTimeoutMs;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    const runningTool: RunningTool = {
      invocationId,
      toolName,
      abortController,
      startTime,
    };
    this.runningTools.set(invocationId, runningTool);
    this.runningCount++;

    let timedOut = false;
    let resultData: Record<string, unknown> = {};
    let errorMessage: string | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener('abort', () => {
        const error = new Error(`Tool timed out after ${timeoutMs}ms`);
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });

    try {
      const toolContext: ToolContext = {
        ...context,
        invocationId,
        abortSignal: abortController.signal,
      };

      resultData = await Promise.race([
        handler(input, toolContext),
        timeoutPromise,
      ]) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        timedOut = true;
        errorMessage = err.message;
        logger.warn(`[ToolExecutor] Tool timed out: ${toolName}`);
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`[ToolExecutor] Tool execution failed: ${toolName}`, errorMessage);
      }
    } finally {
      clearTimeout(timeoutId);
      this.runningTools.delete(invocationId);
      this.runningCount--;
      this.processQueue();
    }

    const durationMs = Date.now() - startTime;
    const success = !errorMessage && !timedOut;

    return {
      invocationId,
      exitCode: success ? 0 : 1,
      stdout: success ? JSON.stringify(resultData) : '',
      stderr: errorMessage ?? '',
      durationMs,
      timedOut,
      success,
      error: errorMessage,
      truncated: false,
      resourceUsage: this.estimateResourceUsage(durationMs),
    };
  }

  private buildErrorResult(
    invocationId: string,
    startTime: number,
    errorMessage: string,
  ): ExecutionResult {
    const durationMs = Date.now() - startTime;
    return {
      invocationId,
      exitCode: 1,
      stdout: '',
      stderr: errorMessage,
      durationMs,
      timedOut: false,
      success: false,
      error: errorMessage,
      truncated: false,
    };
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.runningCount >= this.maxConcurrency) {
      return;
    }

    const next = this.queue.shift();
    if (!next) return;

    const entry = this.registry.get(next.toolName);
    if (!entry) {
      next.resolve(this.buildErrorResult(next.invocationId, Date.now(), `Tool not found: ${next.toolName}`));
      this.processQueue();
      return;
    }

    const startTime = Date.now();
    this.runTool(
      next.invocationId,
      next.toolName,
      entry.handler,
      next.input,
      next.context,
      startTime,
    ).then(next.resolve).catch(next.reject);
  }

  cancel(invocationId: string): boolean {
    const tool = this.runningTools.get(invocationId);
    if (!tool) {
      return false;
    }
    tool.abortController.abort();
    logger.debug(`[ToolExecutor] Cancelled invocation: ${invocationId}`);
    return true;
  }

  getRunningCount(): number {
    return this.runningCount;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getRunningTools(): string[] {
    return Array.from(this.runningTools.values()).map(t => t.toolName);
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }

  registerTool(definition: ToolDefinition, handler: ToolHandler): boolean {
    return this.registry.register(definition, handler);
  }

  private estimateResourceUsage(durationMs: number): ResourceUsage {
    return {
      wallTimeMs: durationMs,
    };
  }
}

export function createToolExecutor(options?: ToolExecutorOptions): ToolExecutor {
  return new ToolExecutor(options);
}
