/**
 * MCP 插件工具处理器
 *
 * 提供插件工具的处理器实现，
 * 包括内置工具处理器集合和自定义处理器注册机制。
 * 支持工具执行的拦截、中间件和错误处理。
 */

import { logger } from '../../logger.js';

export type ToolHandlerContext = {
  toolName: string;
  args: Record<string, unknown>;
  sessionId?: string;
  requestId?: string | number;
  pluginId?: string;
  metadata?: Record<string, unknown>;
};

export type ToolHandlerResult = {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
  metadata?: Record<string, unknown>;
};

export type ToolHandler = (
  ctx: ToolHandlerContext,
) => Promise<ToolHandlerResult>;

export type ToolMiddleware = (
  ctx: ToolHandlerContext,
  next: () => Promise<ToolHandlerResult>,
) => Promise<ToolHandlerResult>;

export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  categories?: string[];
  tags?: string[];
  timeoutMs?: number;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
};

type ToolEntry = {
  definition: ToolDefinition;
  handler: ToolHandler;
  pluginId?: string;
  rateLimitState?: {
    windowStart: number;
    requestCount: number;
  };
};

type HandlerRegistration = {
  pattern: RegExp | string;
  handler: ToolHandler;
  priority: number;
};

type ErrorHandler = (
  error: Error,
  ctx: ToolHandlerContext,
) => Promise<ToolHandlerResult> | ToolHandlerResult;

export class PluginToolHandlers {
  private tools: Map<string, ToolEntry> = new Map();
  private globalMiddlewares: ToolMiddleware[] = [];
  private toolMiddlewares: Map<string, ToolMiddleware[]> = new Map();
  private fallbackHandlers: HandlerRegistration[] = [];
  private errorHandler?: ErrorHandler;
  private defaultTimeoutMs: number = 30000;

  registerTool(
    definition: ToolDefinition,
    handler: ToolHandler,
    options?: { pluginId?: string },
  ): void {
    if (this.tools.has(definition.name)) {
      logger.warn(`[PluginToolHandlers] Overwriting existing tool handler: ${definition.name}`);
    }

    this.tools.set(definition.name, {
      definition,
      handler,
      pluginId: options?.pluginId,
    });

    logger.debug(`[PluginToolHandlers] Registered tool handler: ${definition.name}`);
  }

  unregisterTool(name: string): void {
    if (this.tools.has(name)) {
      this.tools.delete(name);
      this.toolMiddlewares.delete(name);
      logger.debug(`[PluginToolHandlers] Unregistered tool handler: ${name}`);
    }
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getToolDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  listToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((entry) => ({ ...entry.definition }));
  }

  getToolCount(): number {
    return this.tools.size;
  }

  addGlobalMiddleware(middleware: ToolMiddleware): void {
    this.globalMiddlewares.push(middleware);
    logger.debug('[PluginToolHandlers] Added global middleware');
  }

  addToolMiddleware(toolName: string, middleware: ToolMiddleware): void {
    if (!this.toolMiddlewares.has(toolName)) {
      this.toolMiddlewares.set(toolName, []);
    }
    this.toolMiddlewares.get(toolName)!.push(middleware);
    logger.debug(`[PluginToolHandlers] Added middleware for tool: ${toolName}`);
  }

  clearGlobalMiddlewares(): void {
    this.globalMiddlewares = [];
  }

  clearToolMiddlewares(toolName?: string): void {
    if (toolName) {
      this.toolMiddlewares.delete(toolName);
    } else {
      this.toolMiddlewares.clear();
    }
  }

  registerFallbackHandler(
    pattern: RegExp | string,
    handler: ToolHandler,
    priority: number = 0,
  ): void {
    this.fallbackHandlers.push({ pattern, handler, priority });
    this.fallbackHandlers.sort((a, b) => b.priority - a.priority);
    logger.debug(`[PluginToolHandlers] Registered fallback handler with priority ${priority}`);
  }

  clearFallbackHandlers(): void {
    this.fallbackHandlers = [];
  }

  setErrorHandler(handler: ErrorHandler): void {
    this.errorHandler = handler;
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    options?: { sessionId?: string; requestId?: string | number; pluginId?: string; metadata?: Record<string, unknown> },
  ): Promise<ToolHandlerResult> {
    const ctx: ToolHandlerContext = {
      toolName: name,
      args,
      sessionId: options?.sessionId,
      requestId: options?.requestId,
      pluginId: options?.pluginId,
      metadata: options?.metadata,
    };

    const entry = this.tools.get(name);
    let handler: ToolHandler | undefined = entry?.handler;

    if (!handler) {
      handler = this.findFallbackHandler(name);
      if (!handler) {
        return {
          content: [{ type: 'text', text: `Tool not found: ${name}` }],
          isError: true,
        };
      }
    }

    if (entry?.definition.rateLimit) {
      const rateLimitCheck = this.checkRateLimit(entry);
      if (!rateLimitCheck.allowed) {
        return {
          content: [{ type: 'text', text: `Rate limit exceeded for tool: ${name}` }],
          isError: true,
          metadata: { retryAfterMs: rateLimitCheck.retryAfterMs },
        };
      }
    }

    const toolMiddlewares = this.toolMiddlewares.get(name) ?? [];
    const allMiddlewares = [...this.globalMiddlewares, ...toolMiddlewares];

    const timeoutMs = entry?.definition.timeoutMs ?? this.defaultTimeoutMs;

    try {
      const result = await this.executeWithMiddleware(
        ctx,
        handler,
        allMiddlewares,
      );
      return result;
    } catch (err) {
      logger.error(`[PluginToolHandlers] Tool ${name} error: ${String(err)}`);

      if (this.errorHandler) {
        try {
          return await this.errorHandler(err as Error, ctx);
        } catch (handlerErr) {
          logger.error(`[PluginToolHandlers] Error handler failed: ${String(handlerErr)}`);
        }
      }

      return {
        content: [{ type: 'text', text: `Tool error: ${String(err)}` }],
        isError: true,
      };
    }
  }

  private async executeWithMiddleware(
    ctx: ToolHandlerContext,
    handler: ToolHandler,
    middlewares: ToolMiddleware[],
  ): Promise<ToolHandlerResult> {
    if (middlewares.length === 0) {
      return handler(ctx);
    }

    const [first, ...rest] = middlewares;
    return first(ctx, async () => {
      return this.executeWithMiddleware(ctx, handler, rest);
    });
  }

  private findFallbackHandler(toolName: string): ToolHandler | undefined {
    for (const registration of this.fallbackHandlers) {
      if (typeof registration.pattern === 'string') {
        if (toolName.startsWith(registration.pattern)) {
          return registration.handler;
        }
      } else if (registration.pattern.test(toolName)) {
        return registration.handler;
      }
    }
    return undefined;
  }

  private checkRateLimit(entry: ToolEntry): { allowed: boolean; retryAfterMs?: number } {
    const rateLimit = entry.definition.rateLimit;
    if (!rateLimit) {
      return { allowed: true };
    }

    const now = Date.now();

    if (!entry.rateLimitState || now - entry.rateLimitState.windowStart >= rateLimit.windowMs) {
      entry.rateLimitState = {
        windowStart: now,
        requestCount: 1,
      };
      return { allowed: true };
    }

    if (entry.rateLimitState.requestCount < rateLimit.maxRequests) {
      entry.rateLimitState.requestCount++;
      return { allowed: true };
    }

    const retryAfterMs = rateLimit.windowMs - (now - entry.rateLimitState.windowStart);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  getToolsByPlugin(pluginId: string): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const entry of this.tools.values()) {
      if (entry.pluginId === pluginId) {
        result.push({ ...entry.definition });
      }
    }
    return result;
  }

  unregisterPluginTools(pluginId: string): number {
    let count = 0;
    for (const [name, entry] of this.tools) {
      if (entry.pluginId === pluginId) {
        this.tools.delete(name);
        this.toolMiddlewares.delete(name);
        count++;
      }
    }
    logger.debug(`[PluginToolHandlers] Unregistered ${count} tools for plugin: ${pluginId}`);
    return count;
  }

  clear(): void {
    this.tools.clear();
    this.globalMiddlewares = [];
    this.toolMiddlewares.clear();
    this.fallbackHandlers = [];
    this.errorHandler = undefined;
    logger.debug('[PluginToolHandlers] Cleared all tool handlers');
  }

  setDefaultTimeout(timeoutMs: number): void {
    this.defaultTimeoutMs = timeoutMs;
  }

  getDefaultTimeout(): number {
    return this.defaultTimeoutMs;
  }

  validateArgs(name: string, args: Record<string, unknown>): { valid: boolean; error?: string } {
    const entry = this.tools.get(name);
    if (!entry) {
      return { valid: false, error: `Tool not found: ${name}` };
    }

    const schema = entry.definition.inputSchema;
    if (!schema || !(schema as { properties?: unknown }).properties) {
      return { valid: true };
    }

    const required = (schema as { required?: string[] }).required ?? [];
    const properties = (schema as { properties?: Record<string, { type?: string }> }).properties ?? {};

    for (const req of required) {
      if (args[req] === undefined) {
        return { valid: false, error: `Missing required argument: ${req}` };
      }
    }

    for (const [key, value] of Object.entries(args)) {
      const prop = properties[key];
      if (prop?.type) {
        if (!this.validateType(value, prop.type)) {
          return { valid: false, error: `Argument ${key} has wrong type: expected ${prop.type}` };
        }
      }
    }

    return { valid: true };
  }

  private validateType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      default:
        return true;
    }
  }
}

export const pluginToolHandlers = new PluginToolHandlers();

export function registerToolHandler(
  definition: ToolDefinition,
  handler: ToolHandler,
  options?: { pluginId?: string },
): void {
  pluginToolHandlers.registerTool(definition, handler, options);
}

export async function executeToolHandler(
  name: string,
  args: Record<string, unknown>,
  options?: { sessionId?: string; requestId?: string | number },
): Promise<ToolHandlerResult> {
  return pluginToolHandlers.executeTool(name, args, options);
}
