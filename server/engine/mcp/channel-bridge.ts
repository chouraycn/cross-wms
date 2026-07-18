/**
 * MCP Channel 桥接
 *
 * 在 MCP 服务端与 channel 系统之间建立桥接，
 * 使得 MCP 客户端可以通过 channel 发送和接收消息。
 * 支持透明模式、自适应模式和缓冲模式。
 */

import { logger } from '../../logger.js';
import type { McpServerConfig, McpToolInfo } from '../mcpTypes.js';
import type {
  ChannelBridgeMode,
  ChannelBridgeStats,
  ChannelMessageType,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from './types.js';

export type ChannelBridgeMessage = {
  id: string;
  channel: string;
  accountId?: string;
  from: string;
  to?: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  messageType?: ChannelMessageType;
};

export type ChannelBridgeEventHandler = (message: ChannelBridgeMessage) => Promise<void> | void;

export type ChannelBridgeConfig = {
  serverName: string;
  channelType: string;
  accountId?: string;
  enabled: boolean;
  mode?: ChannelBridgeMode;
  bufferSize?: number;
  flushIntervalMs?: number;
  maxMessageSize?: number;
};

export type BufferedMessage = {
  message: ChannelBridgeMessage;
  resolve: (value: boolean) => void;
  reject: (reason?: unknown) => void;
};

export class McpChannelBridge {
  private readonly config: ChannelBridgeConfig;
  private handlers: Set<ChannelBridgeEventHandler> = new Set();
  private connected = false;
  private stats: ChannelBridgeStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    errors: 0,
    lastActivityAt: 0,
  };
  private buffer: BufferedMessage[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private requestIdCounter = 0;

  constructor(config: ChannelBridgeConfig) {
    this.config = {
      mode: 'transparent',
      bufferSize: 100,
      flushIntervalMs: 100,
      maxMessageSize: 1024 * 1024,
      ...config,
    };
  }

  get serverName(): string {
    return this.config.serverName;
  }

  get channelType(): string {
    return this.config.channelType;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get mode(): ChannelBridgeMode {
    return this.config.mode!;
  }

  addHandler(handler: ChannelBridgeEventHandler): void {
    this.handlers.add(handler);
  }

  removeHandler(handler: ChannelBridgeEventHandler): void {
    this.handlers.delete(handler);
  }

  getStats(): ChannelBridgeStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      errors: 0,
      lastActivityAt: this.connected ? Date.now() : 0,
    };
  }

  async connect(): Promise<boolean> {
    if (this.connected) {
      return true;
    }
    if (!this.config.enabled) {
      return false;
    }
    try {
      logger.info(`[MCP ChannelBridge] Connecting ${this.config.serverName} to ${this.config.channelType} (mode: ${this.config.mode})`);
      this.connected = true;
      this.stats.lastActivityAt = Date.now();

      if (this.config.mode === 'buffered') {
        this.startBuffering();
      }

      return true;
    } catch (err) {
      this.stats.errors++;
      logger.error(`[MCP ChannelBridge] Connect failed: ${String(err)}`);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    logger.info(`[MCP ChannelBridge] Disconnecting ${this.config.serverName} from ${this.config.channelType}`);

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flushBuffer();
    this.connected = false;
  }

  async sendMessage(message: Omit<ChannelBridgeMessage, 'timestamp'>): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    const fullMessage: ChannelBridgeMessage = {
      ...message,
      timestamp: Date.now(),
      messageType: message.messageType ?? this.detectMessageType(message.content),
    };

    const contentSize = Buffer.byteLength(message.content, 'utf-8');
    if (this.config.maxMessageSize && contentSize > this.config.maxMessageSize) {
      this.stats.errors++;
      logger.error(`[MCP ChannelBridge] Message too large: ${contentSize} bytes`);
      return false;
    }

    if (this.config.mode === 'buffered') {
      return this.bufferMessage(fullMessage);
    }

    return this.doSendMessage(fullMessage);
  }

  private async doSendMessage(message: ChannelBridgeMessage): Promise<boolean> {
    try {
      logger.debug(`[MCP ChannelBridge] Sending message from ${this.config.serverName}`);
      this.stats.messagesSent++;
      this.stats.bytesSent += Buffer.byteLength(message.content, 'utf-8');
      this.stats.lastActivityAt = Date.now();
      return true;
    } catch (err) {
      this.stats.errors++;
      logger.error(`[MCP ChannelBridge] Send failed: ${String(err)}`);
      return false;
    }
  }

  private bufferMessage(message: ChannelBridgeMessage): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.buffer.push({ message, resolve, reject });

      if (this.buffer.length >= (this.config.bufferSize ?? 100)) {
        void this.flushBuffer();
      }
    });
  }

  private startBuffering(): void {
    this.flushTimer = setInterval(() => {
      void this.flushBuffer();
    }, this.config.flushIntervalMs ?? 100);
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const messages = this.buffer.splice(0);
    for (const item of messages) {
      try {
        const result = await this.doSendMessage(item.message);
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  async receiveMessage(message: ChannelBridgeMessage): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.stats.messagesReceived++;
    this.stats.bytesReceived += Buffer.byteLength(message.content, 'utf-8');
    this.stats.lastActivityAt = Date.now();

    logger.debug(`[MCP ChannelBridge] Received message for ${this.config.serverName}`);

    for (const handler of this.handlers) {
      try {
        await handler(message);
      } catch (err) {
        this.stats.errors++;
        logger.error(`[MCP ChannelBridge] Handler error: ${String(err)}`);
      }
    }
  }

  async sendRequest(request: Omit<JsonRpcRequest, 'jsonrpc' | 'id'> & { id?: string | number }): Promise<JsonRpcResponse> {
    const id = request.id ?? this.generateRequestId();
    const fullRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: request.method,
      params: request.params,
    };

    const success = await this.sendMessage({
      id: `req-${id}`,
      channel: this.config.channelType,
      accountId: this.config.accountId,
      from: this.config.serverName,
      content: JSON.stringify(fullRequest),
      messageType: 'request',
    });

    if (!success) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'Failed to send request',
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  }

  async sendResponse(response: JsonRpcResponse): Promise<boolean> {
    return this.sendMessage({
      id: `resp-${response.id}`,
      channel: this.config.channelType,
      accountId: this.config.accountId,
      from: this.config.serverName,
      content: JSON.stringify(response),
      messageType: 'response',
    });
  }

  async sendNotification(notification: JsonRpcNotification): Promise<boolean> {
    return this.sendMessage({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: this.config.channelType,
      accountId: this.config.accountId,
      from: this.config.serverName,
      content: JSON.stringify(notification),
      messageType: 'notification',
    });
  }

  private generateRequestId(): string {
    this.requestIdCounter++;
    return `${this.config.serverName}-${Date.now()}-${this.requestIdCounter}`;
  }

  private detectMessageType(content: string): ChannelMessageType {
    try {
      const parsed = JSON.parse(content);
      if (parsed.method && parsed.id !== undefined) {
        return 'request';
      }
      if (parsed.result !== undefined || parsed.error !== undefined) {
        return 'response';
      }
      if (parsed.method && parsed.id === undefined) {
        return 'notification';
      }
      return 'event';
    } catch {
      return 'event';
    }
  }

  getHandlerCount(): number {
    return this.handlers.size;
  }

  clearHandlers(): void {
    this.handlers.clear();
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}

export function createMcpChannelBridge(config: ChannelBridgeConfig): McpChannelBridge {
  return new McpChannelBridge(config);
}

export function bridgeToolsFromChannel(
  serverName: string,
  channelTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
): McpToolInfo[] {
  return channelTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function filterToolsByPrefix(
  tools: McpToolInfo[],
  prefix: string,
): McpToolInfo[] {
  return tools.filter((tool) => tool.name.startsWith(prefix));
}

export function normalizeToolName(serverName: string, toolName: string): string {
  return `${serverName}/${toolName}`;
}

export function parseToolName(fullName: string): { serverName: string; toolName: string } {
  const separatorIndex = fullName.indexOf('/');
  if (separatorIndex === -1) {
    return { serverName: '', toolName: fullName };
  }
  return {
    serverName: fullName.slice(0, separatorIndex),
    toolName: fullName.slice(separatorIndex + 1),
  };
}
