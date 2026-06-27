/**
 * MCP Manager (Deep Integration)
 * MCP 管理器 - 深度集成 MCP (Model Context Protocol)
 */

export type MCPTransportType = "stdio" | "sse" | "http" | "websocket";
export type MCPConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "reconnecting";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  tags?: string[];
  category?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

export interface MCPConnection {
  id: string;
  name: string;
  type: MCPTransportType;
  status: MCPConnectionStatus;
  endpoint?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
  connectedAt?: number;
  lastActiveAt?: number;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  autoReconnect: boolean;
  metadata?: Record<string, unknown>;
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    sampling: boolean;
  };
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

class MCPManager {
  private readonly connections = new Map<string, MCPConnection>();
  private readonly toolToConnection = new Map<string, string>();
  private reconnectIntervalMs = 5000;

  constructor() {
    // 空构造函数
  }

  // ========== Connection Management ==========

  async connect(params: {
    name: string;
    type: MCPTransportType;
    command?: string;
    args?: string[];
    endpoint?: string;
    env?: Record<string, string>;
    autoReconnect?: boolean;
    maxRetries?: number;
    metadata?: Record<string, unknown>;
  }): Promise<MCPConnection> {
    const id = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const connection: MCPConnection = {
      id,
      name: params.name,
      type: params.type,
      status: "connecting",
      command: params.command,
      args: params.args,
      endpoint: params.endpoint,
      env: params.env,
      tools: [],
      resources: [],
      prompts: [],
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
      autoReconnect: params.autoReconnect ?? true,
      connectedAt: now,
      lastActiveAt: now,
      metadata: params.metadata,
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        sampling: false,
      },
    };

    this.connections.set(id, connection);

    // 模拟连接过程
    try {
      await this.initializeConnection(connection);
      connection.status = "connected";
      connection.lastActiveAt = Date.now();
      this.connections.set(id, connection);
      this.registerConnectionTools(connection);
      return connection;
    } catch (error) {
      connection.status = "error";
      connection.errorMessage = error instanceof Error ? error.message : String(error);
      this.connections.set(id, connection);
      throw error;
    }
  }

  private async initializeConnection(connection: MCPConnection): Promise<void> {
    // 模拟初始化
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 根据连接类型设置默认工具
    if (connection.type === "stdio" && connection.command?.includes("mcp")) {
      connection.tools = [
        {
          name: "mcp_tool",
          description: "MCP 标准工具",
          inputSchema: {
            type: "object",
            properties: {
              input: { type: "string", description: "工具输入" },
            },
            required: ["input"],
          },
          tags: ["mcp"],
        },
      ];
      connection.capabilities = {
        tools: true,
        resources: false,
        prompts: false,
        sampling: false,
      };
    }
  }

  private registerConnectionTools(connection: MCPConnection): void {
    for (const tool of connection.tools) {
      this.toolToConnection.set(tool.name, connection.id);
    }
  }

  disconnect(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    // 注销工具映射
    for (const tool of connection.tools) {
      this.toolToConnection.delete(tool.name);
    }

    connection.status = "disconnected";
    this.connections.set(connectionId, connection);
    return true;
  }

  getConnection(connectionId: string): MCPConnection | undefined {
    return this.connections.get(connectionId);
  }

  listConnections(options?: {
    status?: MCPConnectionStatus;
    type?: MCPTransportType;
  }): MCPConnection[] {
    let connections = Array.from(this.connections.values());

    if (options?.status) {
      connections = connections.filter((c) => c.status === options.status);
    }
    if (options?.type) {
      connections = connections.filter((c) => c.type === options.type);
    }

    return connections.sort((a, b) => (b.connectedAt ?? 0) - (a.connectedAt ?? 0));
  }

  // ========== Tool Discovery ==========

  async listTools(connectionId?: string): Promise<MCPTool[]> {
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      return connection?.tools ?? [];
    }

    const allTools: MCPTool[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === "connected") {
        allTools.push(...connection.tools);
      }
    }
    return allTools;
  }

  async listResources(connectionId?: string): Promise<MCPResource[]> {
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      return connection?.resources ?? [];
    }

    const allResources: MCPResource[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === "connected" && connection.capabilities.resources) {
        allResources.push(...connection.resources);
      }
    }
    return allResources;
  }

  async listPrompts(connectionId?: string): Promise<MCPPrompt[]> {
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      return connection?.prompts ?? [];
    }

    const allPrompts: MCPPrompt[] = [];
    for (const connection of this.connections.values()) {
      if (connection.status === "connected" && connection.capabilities.prompts) {
        allPrompts.push(...connection.prompts);
      }
    }
    return allPrompts;
  }

  // ========== Tool Execution ==========

  async callTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResult> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (connection.status !== "connected") {
      throw new Error(`Connection not connected: ${connection.status}`);
    }

    const tool = connection.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    connection.lastActiveAt = Date.now();
    this.connections.set(connectionId, connection);

    // 模拟工具调用
    return {
      content: [
        {
          type: "text",
          text: `Result from ${toolName}: ${JSON.stringify(args)}`,
        },
      ],
    };
  }

  async callToolByName(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResult> {
    const connectionId = this.toolToConnection.get(toolName);
    if (!connectionId) {
      throw new Error(`No connection found for tool: ${toolName}`);
    }
    return this.callTool(connectionId, toolName, args);
  }

  // ========== Resource Access ==========

  async readResource(connectionId: string, uri: string): Promise<MCPToolCallResult> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (!connection.capabilities.resources) {
      throw new Error("Resources not supported by this connection");
    }

    connection.lastActiveAt = Date.now();
    this.connections.set(connectionId, connection);

    return {
      content: [
        {
          type: "text",
          text: `Resource content for ${uri}`,
        },
      ],
    };
  }

  // ========== Reconnection ==========

  async reconnect(connectionId: string): Promise<MCPConnection> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    connection.status = "reconnecting";
    connection.retryCount++;
    this.connections.set(connectionId, connection);

    try {
      await this.initializeConnection(connection);
      connection.status = "connected";
      connection.retryCount = 0;
      connection.lastActiveAt = Date.now();
      this.registerConnectionTools(connection);
    } catch (error) {
      connection.status = "error";
      connection.errorMessage = error instanceof Error ? error.message : String(error);
    }

    this.connections.set(connectionId, connection);
    return connection;
  }

  checkAutoReconnect(): number {
    let reconnected = 0;

    for (const [id, connection] of this.connections) {
      if (
        connection.autoReconnect &&
        (connection.status === "error" || connection.status === "disconnected") &&
        connection.retryCount < connection.maxRetries
      ) {
        this.reconnect(id).catch(() => {});
        reconnected++;
      }
    }

    return reconnected;
  }

  // ========== Stats ==========

  getStats(): {
    totalConnections: number;
    connected: number;
    disconnected: number;
    error: number;
    connecting: number;
    totalTools: number;
    totalResources: number;
    totalPrompts: number;
  } {
    const connections = Array.from(this.connections.values());

    return {
      totalConnections: connections.length,
      connected: connections.filter((c) => c.status === "connected").length,
      disconnected: connections.filter((c) => c.status === "disconnected").length,
      error: connections.filter((c) => c.status === "error").length,
      connecting: connections.filter((c) => c.status === "connecting" || c.status === "reconnecting").length,
      totalTools: connections.reduce((sum, c) => sum + c.tools.length, 0),
      totalResources: connections.reduce((sum, c) => sum + c.resources.length, 0),
      totalPrompts: connections.reduce((sum, c) => sum + c.prompts.length, 0),
    };
  }

  clear(): void {
    this.connections.clear();
    this.toolToConnection.clear();
  }
}

const MCP_MANAGER_INSTANCE = new MCPManager();

export function getMCPManager(): MCPManager {
  return MCP_MANAGER_INSTANCE;
}

export function connectMCP(params: Parameters<MCPManager["connect"]>[0]): ReturnType<MCPManager["connect"]> {
  return MCP_MANAGER_INSTANCE.connect(params);
}

export function disconnectMCP(connectionId: string): boolean {
  return MCP_MANAGER_INSTANCE.disconnect(connectionId);
}

export async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPToolCallResult> {
  return MCP_MANAGER_INSTANCE.callToolByName(toolName, args);
}

export function resetMCPManagerForTests(): void {
  MCP_MANAGER_INSTANCE.clear();
}

export type { MCPManager };
