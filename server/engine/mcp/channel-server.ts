/**
 * MCP Channel 服务器
 *
 * 实现 MCP 服务器端协议，通过 channel 暴露工具和资源。
 * 处理 MCP 请求并通过 channel 系统转发。
 * 支持完整的 MCP 协议方法：tools、resources、prompts、logging 等。
 */

import { logger } from '../../logger.js';
import { McpChannelBridge } from './channel-bridge.js';
import {
  MCP_PROTOCOL_VERSION,
  MCPErrorCode,
  MCPMethod,
  type MCPInitializeParams,
  type MCPInitializeResult,
  type MCPLogLevel,
  type MCPServerCapabilities,
  type MCPServerInfo,
  type MCPPrompt,
  type MCPResource,
  type MCPTool,
  type MCPToolCallResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
} from './types.js';

export type McpRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type McpResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type McpNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
};

export type McpServerCapabilities = {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, never>;
};

export type McpServerInfo = {
  name: string;
  version: string;
};

export type McpInitializeResult = {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: McpServerInfo;
  instructions?: string;
};

type ToolHandler = (args: Record<string, unknown> | undefined) => Promise<MCPToolCallResult>;

type ResourceHandler = (uri: string) => Promise<{ uri: string; mimeType?: string; text?: string; blob?: string }>;

type PromptHandler = (args: Record<string, string> | undefined) => Promise<{
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: Array<{ type: string; text?: string }> }>;
}>;

export class McpChannelServer {
  private readonly serverName: string;
  private readonly bridge: McpChannelBridge;
  private initialized = false;
  private requestHandlers: Map<string, (params: Record<string, unknown> | undefined) => Promise<unknown>> = new Map();
  private capabilities: MCPServerCapabilities = {};
  private serverInfo: MCPServerInfo;
  private instructions?: string;
  private tools: Map<string, { tool: MCPTool; handler: ToolHandler }> = new Map();
  private resources: Map<string, { resource: MCPResource; handler: ResourceHandler }> = new Map();
  private prompts: Map<string, { prompt: MCPPrompt; handler: PromptHandler }> = new Map();
  private logLevel: MCPLogLevel = 'info';
  private clientInfo?: { name: string; version: string };
  private pendingRequests: Map<string | number, { resolve: (response: JsonRpcResponse) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private requestTimeoutMs: number = 30000;

  constructor(serverName: string, bridge: McpChannelBridge) {
    this.serverName = serverName;
    this.bridge = bridge;
    this.serverInfo = {
      name: serverName,
      version: '1.0.0',
    };
    this.setupDefaultHandlers();
  }

  private setupDefaultHandlers(): void {
    this.registerRequestHandler(MCPMethod.INITIALIZE, async (params) => {
      return this.handleInitialize(params as MCPInitializeParams);
    });
    this.registerRequestHandler(MCPMethod.PING, async () => {
      return {};
    });
    this.registerRequestHandler(MCPMethod.TOOLS_LIST, async () => {
      return this.handleToolsList();
    });
    this.registerRequestHandler(MCPMethod.TOOLS_CALL, async (params) => {
      return this.handleToolsCall(params);
    });
    this.registerRequestHandler(MCPMethod.RESOURCES_LIST, async () => {
      return this.handleResourcesList();
    });
    this.registerRequestHandler(MCPMethod.RESOURCES_READ, async (params) => {
      return this.handleResourcesRead(params);
    });
    this.registerRequestHandler(MCPMethod.RESOURCES_SUBSCRIBE, async (params) => {
      return this.handleResourcesSubscribe(params);
    });
    this.registerRequestHandler(MCPMethod.RESOURCES_UNSUBSCRIBE, async (params) => {
      return this.handleResourcesUnsubscribe(params);
    });
    this.registerRequestHandler(MCPMethod.PROMPTS_LIST, async () => {
      return this.handlePromptsList();
    });
    this.registerRequestHandler(MCPMethod.PROMPTS_GET, async (params) => {
      return this.handlePromptsGet(params);
    });
    this.registerRequestHandler(MCPMethod.LOGGING_SET_LEVEL, async (params) => {
      return this.handleLoggingSetLevel(params);
    });
    this.registerRequestHandler(MCPMethod.COMPLETIONS, async (params) => {
      return this.handleCompletions(params);
    });
  }

  registerRequestHandler(
    method: string,
    handler: (params: Record<string, unknown> | undefined) => Promise<unknown>,
  ): void {
    this.requestHandlers.set(method, handler);
  }

  unregisterRequestHandler(method: string): void {
    this.requestHandlers.delete(method);
  }

  setCapabilities(capabilities: MCPServerCapabilities): void {
    this.capabilities = capabilities;
  }

  setServerInfo(info: Partial<MCPServerInfo>): void {
    this.serverInfo = { ...this.serverInfo, ...info };
  }

  setInstructions(instructions: string): void {
    this.instructions = instructions;
  }

  registerTool(tool: MCPTool, handler: ToolHandler): void {
    this.tools.set(tool.name, { tool, handler });
    if (this.capabilities.tools?.listChanged) {
      void this.sendNotification({
        jsonrpc: '2.0',
        method: MCPMethod.TOOLS_LIST_CHANGED,
      });
    }
    logger.debug(`[MCP ChannelServer] Registered tool: ${tool.name}`);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    if (this.capabilities.tools?.listChanged) {
      void this.sendNotification({
        jsonrpc: '2.0',
        method: MCPMethod.TOOLS_LIST_CHANGED,
      });
    }
    logger.debug(`[MCP ChannelServer] Unregistered tool: ${name}`);
  }

  registerResource(resource: MCPResource, handler: ResourceHandler): void {
    this.resources.set(resource.uri, { resource, handler });
    if (this.capabilities.resources?.listChanged) {
      void this.sendNotification({
        jsonrpc: '2.0',
        method: MCPMethod.RESOURCES_LIST_CHANGED,
      });
    }
    logger.debug(`[MCP ChannelServer] Registered resource: ${resource.uri}`);
  }

  unregisterResource(uri: string): void {
    this.resources.delete(uri);
    if (this.capabilities.resources?.listChanged) {
      void this.sendNotification({
        jsonrpc: '2.0',
        method: MCPMethod.RESOURCES_LIST_CHANGED,
      });
    }
    logger.debug(`[MCP ChannelServer] Unregistered resource: ${uri}`);
  }

  registerPrompt(prompt: MCPPrompt, handler: PromptHandler): void {
    this.prompts.set(prompt.name, { prompt, handler });
    if (this.capabilities.prompts?.listChanged) {
      void this.sendNotification({
        jsonrpc: '2.0',
        method: MCPMethod.PROMPTS_LIST_CHANGED,
      });
    }
    logger.debug(`[MCP ChannelServer] Registered prompt: ${prompt.name}`);
  }

  unregisterPrompt(name: string): void {
    this.prompts.delete(name);
    if (this.capabilities.prompts?.listChanged) {
      void this.sendNotification({
        jsonrpc: '2.0',
        method: MCPMethod.PROMPTS_LIST_CHANGED,
      });
    }
    logger.debug(`[MCP ChannelServer] Unregistered prompt: ${name}`);
  }

  async start(): Promise<boolean> {
    logger.info(`[MCP ChannelServer] Starting server: ${this.serverName}`);
    const connected = await this.bridge.connect();
    if (!connected) {
      logger.error(`[MCP ChannelServer] Failed to connect bridge for ${this.serverName}`);
      return false;
    }
    this.bridge.addHandler(async (message) => {
      await this.handleIncomingMessage(message);
    });
    return true;
  }

  async stop(): Promise<void> {
    logger.info(`[MCP ChannelServer] Stopping server: ${this.serverName}`);
    for (const { timeout } of this.pendingRequests.values()) {
      clearTimeout(timeout);
    }
    this.pendingRequests.clear();
    await this.bridge.disconnect();
    this.initialized = false;
  }

  private async handleIncomingMessage(message: { content: string }): Promise<void> {
    try {
      const parsed = JSON.parse(message.content);

      if (parsed.method && parsed.id !== undefined) {
        const request = parsed as McpRequest;
        const response = await this.handleRequest(request);
        await this.sendResponse(response);
      } else if (parsed.id !== undefined && (parsed.result !== undefined || parsed.error !== undefined)) {
        this.handleResponse(parsed as JsonRpcResponse);
      } else if (parsed.method) {
        this.handleNotification(parsed as McpNotification);
      }
    } catch (err) {
      logger.error(`[MCP ChannelServer] Parse error: ${String(err)}`);
    }
  }

  private async handleRequest(request: McpRequest): Promise<McpResponse> {
    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: MCPErrorCode.METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
        },
      };
    }

    try {
      const result = await handler(request.params);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (err) {
      logger.error(`[MCP ChannelServer] Request error (${request.method}): ${String(err)}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
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

  private handleNotification(notification: McpNotification): void {
    logger.debug(`[MCP ChannelServer] Received notification: ${notification.method}`);
  }

  private handleInitialize(params: MCPInitializeParams | undefined): MCPInitializeResult {
    if (params?.clientInfo) {
      this.clientInfo = params.clientInfo;
    }
    this.initialized = true;
    logger.info(`[MCP ChannelServer] Initialized by client: ${this.clientInfo?.name ?? 'unknown'}`);

    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
      instructions: this.instructions,
    };
  }

  private handleToolsList(): { tools: MCPTool[] } {
    return {
      tools: Array.from(this.tools.values()).map((t) => t.tool),
    };
  }

  private async handleToolsCall(params: Record<string, unknown> | undefined): Promise<MCPToolCallResult> {
    const name = params?.name as string | undefined;
    const args = (params?.arguments as Record<string, unknown>) ?? {};

    if (!name) {
      return {
        content: [{ type: 'text', text: 'Tool name required' }],
        isError: true,
      };
    }

    const toolEntry = this.tools.get(name);
    if (!toolEntry) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    logger.debug(`[MCP ChannelServer] Tool call: ${name}`);
    return toolEntry.handler(args);
  }

  private handleResourcesList(): { resources: MCPResource[] } {
    return {
      resources: Array.from(this.resources.values()).map((r) => r.resource),
    };
  }

  private async handleResourcesRead(params: Record<string, unknown> | undefined): Promise<{
    contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
  }> {
    const uri = params?.uri as string | undefined;
    if (!uri) {
      throw new Error('Resource URI required');
    }

    const resourceEntry = this.resources.get(uri);
    if (!resourceEntry) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const content = await resourceEntry.handler(uri);
    return { contents: [content] };
  }

  private handleResourcesSubscribe(params: Record<string, unknown> | undefined): Record<string, never> {
    const uri = params?.uri as string | undefined;
    if (!uri) {
      throw new Error('Resource URI required');
    }
    logger.debug(`[MCP ChannelServer] Subscribed to resource: ${uri}`);
    return {};
  }

  private handleResourcesUnsubscribe(params: Record<string, unknown> | undefined): Record<string, never> {
    const uri = params?.uri as string | undefined;
    if (!uri) {
      throw new Error('Resource URI required');
    }
    logger.debug(`[MCP ChannelServer] Unsubscribed from resource: ${uri}`);
    return {};
  }

  private handlePromptsList(): { prompts: MCPPrompt[] } {
    return {
      prompts: Array.from(this.prompts.values()).map((p) => p.prompt),
    };
  }

  private async handlePromptsGet(params: Record<string, unknown> | undefined): Promise<{
    messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
  }> {
    const name = params?.name as string | undefined;
    const args = (params?.arguments as Record<string, string>) ?? {};

    if (!name) {
      throw new Error('Prompt name required');
    }

    const promptEntry = this.prompts.get(name);
    if (!promptEntry) {
      throw new Error(`Prompt not found: ${name}`);
    }

    return promptEntry.handler(args);
  }

  private handleLoggingSetLevel(params: Record<string, unknown> | undefined): Record<string, never> {
    const level = params?.level as MCPLogLevel | undefined;
    if (level) {
      this.logLevel = level;
      logger.debug(`[MCP ChannelServer] Log level set to: ${level}`);
    }
    return {};
  }

  private handleCompletions(_params: Record<string, unknown> | undefined): {
    completion: { values: string[]; hasMore: boolean };
  } {
    return {
      completion: {
        values: [],
        hasMore: false,
      },
    };
  }

  private async sendResponse(response: McpResponse): Promise<void> {
    const content = JSON.stringify(response);
    await this.bridge.sendMessage({
      id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: this.bridge.channelType,
      accountId: this.serverName,
      from: this.serverName,
      content,
      messageType: 'response',
    });
  }

  async sendNotification(notification: McpNotification): Promise<void> {
    if (!this.initialized) return;
    const content = JSON.stringify(notification);
    await this.bridge.sendMessage({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: this.bridge.channelType,
      accountId: this.serverName,
      from: this.serverName,
      content,
      messageType: 'notification',
    });
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

      void this.bridge.sendMessage({
        id: `req-${id}`,
        channel: this.bridge.channelType,
        accountId: this.serverName,
        from: this.serverName,
        content: JSON.stringify(request),
        messageType: 'request',
      });
    });
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

  getResourceCount(): number {
    return this.resources.size;
  }

  getPromptCount(): number {
    return this.prompts.size;
  }

  getLogLevel(): MCPLogLevel {
    return this.logLevel;
  }

  setRequestTimeout(timeoutMs: number): void {
    this.requestTimeoutMs = timeoutMs;
  }
}

export function createMcpChannelServer(
  serverName: string,
  bridge: McpChannelBridge,
): McpChannelServer {
  return new McpChannelServer(serverName, bridge);
}
