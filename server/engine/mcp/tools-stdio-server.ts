/**
 * MCP stdio 服务器
 *
 * 通过 stdio 协议提供 MCP 服务端能力，
 * 允许外部 MCP 客户端通过标准输入输出连接。
 * 支持完整的 MCP 协议方法和工具注册。
 */

import { logger } from '../../logger.js';
import type { McpToolInfo } from '../mcpTypes.js';
import {
  MCP_PROTOCOL_VERSION,
  MCPErrorCode,
  MCPMethod,
  type MCPLogLevel,
  type MCPServerCapabilities,
  type MCPServerInfo,
  type MCPTool,
  type MCPToolCallResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
} from './types.js';

export type StdioServerConfig = {
  serverName: string;
  version: string;
  tools?: McpToolInfo[];
  capabilities?: MCPServerCapabilities;
  instructions?: string;
};

export type StdioRequestHandler = (
  params: Record<string, unknown> | undefined,
) => Promise<unknown>;

export type StdioToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;

type McpMessage = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type ToolEntry = {
  definition: McpToolInfo;
  handler: StdioToolHandler;
};

export class McpStdioServer {
  private readonly config: StdioServerConfig;
  private running = false;
  private initialized = false;
  private requestHandlers: Map<string, StdioRequestHandler> = new Map();
  private tools: Map<string, ToolEntry> = new Map();
  private serverInfo: MCPServerInfo;
  private capabilities: MCPServerCapabilities;
  private logLevel: MCPLogLevel = 'info';
  private clientInfo?: { name: string; version: string };
  private pendingRequests: Map<string | number, { resolve: (response: JsonRpcResponse) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private requestTimeoutMs: number = 30000;
  private messageBuffer: string = '';

  constructor(config: StdioServerConfig) {
    this.config = config;
    this.serverInfo = {
      name: config.serverName,
      version: config.version,
    };
    this.capabilities = config.capabilities ?? {};
    this.setupDefaultHandlers();

    if (config.tools) {
      for (const tool of config.tools) {
        this.tools.set(tool.name, {
          definition: tool,
          handler: async () => ({
            content: [{ type: 'text', text: `Tool ${tool.name} not implemented` }],
            isError: true,
          }),
        });
      }
    }
  }

  private setupDefaultHandlers(): void {
    this.registerRequestHandler(MCPMethod.INITIALIZE, async (params) => {
      return this.handleInitialize(params);
    });

    this.registerRequestHandler('initialized', async () => {
      return {};
    });

    this.registerRequestHandler(MCPMethod.PING, async () => {
      return {};
    });

    this.registerRequestHandler(MCPMethod.TOOLS_LIST, async () => {
      return { tools: this.listToolDefinitions() };
    });

    this.registerRequestHandler(MCPMethod.TOOLS_CALL, async (params) => {
      const name = params?.name as string | undefined;
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      if (!name) {
        throw new Error('Tool name required');
      }
      return await this.callTool(name, args);
    });

    this.registerRequestHandler(MCPMethod.LOGGING_SET_LEVEL, async (params) => {
      const level = params?.level as MCPLogLevel | undefined;
      if (level) {
        this.logLevel = level;
      }
      return {};
    });
  }

  private handleInitialize(params: Record<string, unknown> | undefined) {
    if (params?.clientInfo && typeof params.clientInfo === 'object') {
      const clientInfo = params.clientInfo as { name?: string; version?: string };
      this.clientInfo = {
        name: clientInfo.name ?? 'unknown',
        version: clientInfo.version ?? '0.0.0',
      };
    }
    this.initialized = true;
    logger.info(`[McpStdioServer] Initialized by client: ${this.clientInfo?.name ?? 'unknown'}`);

    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
      instructions: this.config.instructions,
    };
  }

  registerRequestHandler(method: string, handler: StdioRequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  unregisterRequestHandler(method: string): void {
    this.requestHandlers.delete(method);
  }

  registerTool(tool: McpToolInfo, handler: StdioToolHandler): void {
    this.tools.set(tool.name, {
      definition: tool,
      handler,
    });
    logger.debug(`[McpStdioServer] Registered tool: ${tool.name}`);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    logger.debug(`[McpStdioServer] Unregistered tool: ${name}`);
  }

  listTools(): McpToolInfo[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  private listToolDefinitions(): MCPTool[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      inputSchema: t.definition.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await entry.handler(args);
      return {
        content: result.content as MCPToolCallResult['content'],
        isError: result.isError,
      };
    } catch (err) {
      logger.error(`[McpStdioServer] Tool ${name} error: ${String(err)}`);
      return {
        content: [{ type: 'text', text: `Tool error: ${String(err)}` }],
        isError: true,
      };
    }
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    logger.info(`[McpStdioServer] Starting server: ${this.config.serverName}`);

    if (typeof process !== 'undefined' && process.stdin && process.stdout) {
      this.setupStdioHandlers();
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.initialized = false;

    for (const { timeout } of this.pendingRequests.values()) {
      clearTimeout(timeout);
    }
    this.pendingRequests.clear();

    logger.info(`[McpStdioServer] Stopping server: ${this.config.serverName}`);
  }

  private setupStdioHandlers(): void {
    process.stdin.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      let newlineIndex: number;
      while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
        const line = this.messageBuffer.slice(0, newlineIndex).trim();
        this.messageBuffer = this.messageBuffer.slice(newlineIndex + 1);
        if (line) {
          void this.handleMessage(line);
        }
      }
    });
  }

  private async handleMessage(line: string): Promise<void> {
    try {
      const message = JSON.parse(line) as McpMessage;

      if (message.method && message.id !== undefined) {
        const response = await this.handleRequest(message);
        this.sendMessage(response);
      } else if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
        this.handleResponse(message as JsonRpcResponse);
      } else if (message.method) {
        this.handleNotification(message as JsonRpcNotification);
      }
    } catch (err) {
      logger.error(`[McpStdioServer] Parse error: ${String(err)}`);
    }
  }

  private async handleRequest(request: McpMessage): Promise<McpMessage> {
    const method = request.method;
    if (!method) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: MCPErrorCode.INVALID_REQUEST,
          message: 'Invalid Request: missing method',
        },
      };
    }

    const handler = this.requestHandlers.get(method);
    if (!handler) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: MCPErrorCode.METHOD_NOT_FOUND,
          message: `Method not found: ${method}`,
        },
      };
    }

    try {
      const result = await handler(request.params);
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result,
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: MCPErrorCode.INTERNAL_ERROR,
          message: String(err),
        },
      };
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const id = response.id;
    if (id === null || id === undefined) {
      return;
    }

    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      pending.resolve(response);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    logger.debug(`[McpStdioServer] Received notification: ${notification.method}`);
  }

  private sendMessage(message: McpMessage): void {
    if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.write(JSON.stringify(message) + '\n');
    }
  }

  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.initialized) return;
    const notification: McpMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.sendMessage(notification);
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({
          jsonrpc: '2.0',
          id,
          error: {
            code: MCPErrorCode.INTERNAL_ERROR,
            message: 'Request timeout',
          },
        });
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, timeout });
      this.sendMessage(request);
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getClientInfo(): { name: string; version: string } | undefined {
    return this.clientInfo;
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getLogLevel(): MCPLogLevel {
    return this.logLevel;
  }

  setRequestTimeout(timeoutMs: number): void {
    this.requestTimeoutMs = timeoutMs;
  }

  setCapabilities(capabilities: MCPServerCapabilities): void {
    this.capabilities = capabilities;
  }

  getCapabilities(): MCPServerCapabilities {
    return { ...this.capabilities };
  }

  getServerInfo(): MCPServerInfo {
    return { ...this.serverInfo };
  }
}

export function createMcpStdioServer(config: StdioServerConfig): McpStdioServer {
  return new McpStdioServer(config);
}
