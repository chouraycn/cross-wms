/**
 * MCP 工具执行器
 *
 * 实现 MCP 工具执行协议，支持参数验证、速率限制、超时控制、
 * 并发控制、取消操作、执行上下文管理等高级功能。
 */

import { logger } from '../../logger.js';
import type {
  MCPTool,
  MCPToolCallResult,
  ToolExecutionContext,
  ToolExecutionState,
} from './types.js';

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  handler: (args: unknown, context?: ToolExecutionContext) => Promise<ToolResult> | ToolResult;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type ToolResult = {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
};

export type ValidationResult = {
  valid: boolean;
  errors?: string[];
};

export type RateLimit = {
  maxRequests: number;
  windowMs: number;
};

export type ToolExecutorConfig = {
  defaultTimeoutMs?: number;
  maxConcurrentTools?: number;
};

type ToolConfig = {
  definition: ToolDefinition;
  rateLimit?: RateLimit;
  timeoutMs?: number;
  requestTimestamps: number[];
  executionCount: number;
  totalExecutionTimeMs: number;
  failedCount: number;
};

export class ToolExecutor {
  private tools: Map<string, ToolConfig> = new Map();
  private config: ToolExecutorConfig;
  private activeExecutions: Map<string, ToolExecutionContext> = new Map();
  private queuedExecutions: Array<{
    toolName: string;
    args: unknown;
    context: ToolExecutionContext;
    resolve: (result: ToolResult) => void;
  }> = [];

  constructor(config: ToolExecutorConfig = {}) {
    this.config = {
      defaultTimeoutMs: 30000,
      maxConcurrentTools: 10,
      ...config,
    };
  }

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`[ToolExecutor] Overwriting existing tool: ${tool.name}`);
    }

    const existing = this.tools.get(tool.name);
    this.tools.set(tool.name, {
      definition: tool,
      requestTimestamps: [],
      executionCount: existing?.executionCount ?? 0,
      totalExecutionTimeMs: existing?.totalExecutionTimeMs ?? 0,
      failedCount: existing?.failedCount ?? 0,
    });

    logger.debug(`[ToolExecutor] Registered tool: ${tool.name}`);
  }

  unregisterTool(toolName: string): void {
    this.tools.delete(toolName);
    logger.debug(`[ToolExecutor] Unregistered tool: ${toolName}`);
  }

  setRateLimit(toolName: string, limit: RateLimit): void {
    const config = this.tools.get(toolName);
    if (!config) {
      logger.warn(`[ToolExecutor] Cannot set rate limit for non-existent tool: ${toolName}`);
      return;
    }

    config.rateLimit = limit;
    logger.debug(`[ToolExecutor] Set rate limit for tool ${toolName}: ${limit.maxRequests} requests per ${limit.windowMs}ms`);
  }

  setTimeout(toolName: string, timeoutMs: number): void {
    const config = this.tools.get(toolName);
    if (!config) {
      logger.warn(`[ToolExecutor] Cannot set timeout for non-existent tool: ${toolName}`);
      return;
    }

    config.timeoutMs = timeoutMs;
    logger.debug(`[ToolExecutor] Set timeout for tool ${toolName}: ${timeoutMs}ms`);
  }

  validate(toolName: string, args: unknown): ValidationResult {
    const config = this.tools.get(toolName);
    if (!config) {
      return {
        valid: false,
        errors: [`Tool not found: ${toolName}`],
      };
    }

    const schema = config.definition.inputSchema;

    if (schema.type === 'object' && schema.properties) {
      const errors: string[] = [];
      const properties = schema.properties as Record<string, unknown>;
      const required = schema.required as string[] | undefined;

      if (required && Array.isArray(required)) {
        for (const field of required) {
          if (args === undefined || args === null || typeof args !== 'object' || !(field in args)) {
            errors.push(`Missing required field: ${field}`);
          }
        }
      }

      if (args && typeof args === 'object') {
        for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
          const propSchema = properties[key] as Record<string, unknown> | undefined;
          if (propSchema) {
            const expectedType = propSchema.type as string | undefined;
            if (expectedType && !this.checkType(value, expectedType)) {
              errors.push(`Field ${key} has wrong type: expected ${expectedType}`);
            }

            if (propSchema.enum && Array.isArray(propSchema.enum) && value !== undefined) {
              if (!propSchema.enum.includes(value)) {
                errors.push(`Field ${key} must be one of: ${propSchema.enum.join(', ')}`);
              }
            }

            if (expectedType === 'string' && typeof value === 'string') {
              if (propSchema.minLength !== undefined && value.length < (propSchema.minLength as number)) {
                errors.push(`Field ${key} must be at least ${propSchema.minLength} characters`);
              }
              if (propSchema.maxLength !== undefined && value.length > (propSchema.maxLength as number)) {
                errors.push(`Field ${key} must be at most ${propSchema.maxLength} characters`);
              }
              if (propSchema.pattern && !(new RegExp(propSchema.pattern as string).test(value))) {
                errors.push(`Field ${key} does not match pattern: ${propSchema.pattern}`);
              }
            }

            if (expectedType === 'number' && typeof value === 'number') {
              if (propSchema.minimum !== undefined && value < (propSchema.minimum as number)) {
                errors.push(`Field ${key} must be at least ${propSchema.minimum}`);
              }
              if (propSchema.maximum !== undefined && value > (propSchema.maximum as number)) {
                errors.push(`Field ${key} must be at most ${propSchema.maximum}`);
              }
            }
          }
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors };
      }
    }

    return { valid: true };
  }

  async execute(toolName: string, args: unknown, options?: { sessionId?: string; requestId?: string | number }): Promise<ToolResult> {
    const config = this.tools.get(toolName);
    if (!config) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
        isError: true,
      };
    }

    if (!this.checkRateLimit(config)) {
      return {
        content: [{ type: 'text', text: `Rate limit exceeded for tool: ${toolName}` }],
        isError: true,
      };
    }

    const validation = this.validate(toolName, args);
    if (!validation.valid) {
      return {
        content: [{ type: 'text', text: `Validation failed: ${validation.errors?.join(', ')}` }],
        isError: true,
      };
    }

    const context: ToolExecutionContext = {
      toolName,
      arguments: args as Record<string, unknown>,
      sessionId: options?.sessionId,
      requestId: options?.requestId,
      startTime: Date.now(),
      state: 'pending',
      abortController: new AbortController(),
    };

    if (this.activeExecutions.size >= (this.config.maxConcurrentTools ?? 10)) {
      return new Promise((resolve) => {
        this.queuedExecutions.push({
          toolName,
          args,
          context,
          resolve,
        });
        logger.debug(`[ToolExecutor] Queued execution for tool: ${toolName} (queue: ${this.queuedExecutions.length})`);
      });
    }

    return this.doExecute(config, args, context);
  }

  private async doExecute(config: ToolConfig, args: unknown, context: ToolExecutionContext): Promise<ToolResult> {
    const executionId = this.generateExecutionId();
    this.activeExecutions.set(executionId, context);
    context.state = 'running';

    logger.debug(`[ToolExecutor] Executing tool: ${context.toolName} (id: ${executionId})`);

    const startTime = Date.now();

    try {
      const result = await this.executeWithTimeout(config, args, context);
      context.state = 'completed';
      config.executionCount++;
      config.totalExecutionTimeMs += Date.now() - startTime;
      return result;
    } catch (err) {
      context.state = 'failed';
      config.failedCount++;
      config.executionCount++;
      config.totalExecutionTimeMs += Date.now() - startTime;
      logger.error(`[ToolExecutor] Tool ${context.toolName} execution error: ${String(err)}`);
      return {
        content: [{ type: 'text', text: `Execution error: ${String(err)}` }],
        isError: true,
      };
    } finally {
      this.activeExecutions.delete(executionId);
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queuedExecutions.length === 0) {
      return;
    }

    if (this.activeExecutions.size >= (this.config.maxConcurrentTools ?? 10)) {
      return;
    }

    const next = this.queuedExecutions.shift();
    if (next) {
      const config = this.tools.get(next.toolName);
      if (config) {
        void this.doExecute(config, next.args, next.context).then(next.resolve);
      }
    }
  }

  cancelTool(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      return false;
    }

    if (context.abortController) {
      context.abortController.abort();
      context.state = 'cancelled';
      logger.debug(`[ToolExecutor] Cancelled tool execution: ${context.toolName}`);
    }

    return true;
  }

  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  getTool(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName)?.definition;
  }

  listTools(): MCPTool[] {
    return Array.from(this.tools.values()).map((config) => ({
      name: config.definition.name,
      description: config.definition.description,
      inputSchema: config.definition.inputSchema,
      outputSchema: config.definition.outputSchema,
      annotations: config.definition.annotations,
    }));
  }

  clear(): void {
    this.tools.clear();
    this.activeExecutions.clear();
    this.queuedExecutions = [];
    logger.debug('[ToolExecutor] Cleared all tools');
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getActiveExecutionCount(): number {
    return this.activeExecutions.size;
  }

  getQueuedExecutionCount(): number {
    return this.queuedExecutions.length;
  }

  getToolStats(toolName: string): {
    executionCount: number;
    totalExecutionTimeMs: number;
    failedCount: number;
    averageExecutionTimeMs: number;
  } | undefined {
    const config = this.tools.get(toolName);
    if (!config) {
      return undefined;
    }

    return {
      executionCount: config.executionCount,
      totalExecutionTimeMs: config.totalExecutionTimeMs,
      failedCount: config.failedCount,
      averageExecutionTimeMs: config.executionCount > 0 ? config.totalExecutionTimeMs / config.executionCount : 0,
    };
  }

  private checkRateLimit(config: ToolConfig): boolean {
    if (!config.rateLimit) {
      return true;
    }

    const now = Date.now();
    const { maxRequests, windowMs } = config.rateLimit;

    config.requestTimestamps = config.requestTimestamps.filter(
      (ts) => now - ts < windowMs,
    );

    if (config.requestTimestamps.length >= maxRequests) {
      return false;
    }

    config.requestTimestamps.push(now);
    return true;
  }

  private async executeWithTimeout(config: ToolConfig, args: unknown, context: ToolExecutionContext): Promise<ToolResult> {
    const { definition } = config;
    const timeoutMs = config.timeoutMs ?? this.config.defaultTimeoutMs;

    if (!timeoutMs) {
      return await definition.handler(args, context);
    }

    return new Promise<ToolResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      if (context.abortController) {
        context.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Tool execution cancelled'));
        });
      }

      Promise.resolve(definition.handler(args, context))
        .then((result: ToolResult) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          reject(err);
        });
    });
  }

  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true;
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  setMaxConcurrentTools(max: number): void {
    this.config.maxConcurrentTools = max;
    logger.debug(`[ToolExecutor] Set max concurrent tools: ${max}`);
  }

  getConfig(): ToolExecutorConfig {
    return { ...this.config };
  }
}

export const toolExecutor = new ToolExecutor();

export function registerTool(tool: ToolDefinition): void {
  toolExecutor.registerTool(tool);
}

export async function executeTool(toolName: string, args: unknown): Promise<ToolResult> {
  return toolExecutor.execute(toolName, args);
}

export function validateTool(toolName: string, args: unknown): ValidationResult {
  return toolExecutor.validate(toolName, args);
}
