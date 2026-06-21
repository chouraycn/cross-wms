/**
 * McpClientManager — MCP Server 连接生命周期管理（Module-level Singleton）
 *
 * 管理 MCP Server 的连接/断开/重连，以及工具发现与执行代理。
 * 工具名在内部使用 mcp__{serverName}__{toolName} 格式。
 *
 * 连接流程：
 * 1. 创建 StdioClientTransport（command, args, env）
 * 2. 创建 Client（{ name, version }）
 * 3. client.connect(transport)
 * 4. client.listTools() → 缓存工具
 * 5. 连接失败 → 标记 error 状态 + 记录错误信息
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig, McpServerState, McpToolInfo, McpConnectionState } from './mcpTypes.js';
import { sanitizeServerName, makeMcpToolName, parseMcpToolName } from './mcpTypes.js';
import { addServer, getServer, updateServer, deleteServer, listServers } from './mcpConfigStore.js';
import type { ToolDefinition } from '../aiClient.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** MCP Client 实例及其关联状态 */
interface McpClientEntry {
  /** Server 配置 */
  config: McpServerConfig;
  /** MCP SDK Client 实例 */
  client: Client;
  /** Stdio 传输实例 */
  transport: StdioClientTransport;
  /** 连接状态 */
  connectionState: McpConnectionState;
  /** 已发现的工具（原始名称） */
  tools: McpToolInfo[];
  /** 错误信息 */
  error?: string;
  /** 最后连接时间 */
  lastConnectedAt?: number;
}

// ===================== McpClientManager 类 =====================

class McpClientManager {
  private static instance: McpClientManager;

  /** 已连接的 Server（serverId → McpClientEntry） */
  private clients: Map<string, McpClientEntry> = new Map();

  /** serverName sanitized → serverId 的映射 */
  private nameToIdMap: Map<string, string> = new Map();

  private constructor() {}

  /** 获取单例实例 */
  static getInstance(): McpClientManager {
    if (!McpClientManager.instance) {
      McpClientManager.instance = new McpClientManager();
    }
    return McpClientManager.instance;
  }

  // ===================== 配置 CRUD（委托给 McpConfigStore） =====================

  /** 添加 Server 配置 */
  addServerConfig(input: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
    return addServer(input);
  }

  /** 获取 Server 配置 */
  getServerConfig(id: string): McpServerConfig | undefined {
    return getServer(id);
  }

  /** 更新 Server 配置 */
  updateServerConfig(id: string, updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt'>>): McpServerConfig | undefined {
    return updateServer(id, updates);
  }

  /** 删除 Server 配置 */
  deleteServerConfig(id: string): boolean {
    return deleteServer(id);
  }

  /** 列出所有 Server 配置 */
  listServerConfigs(enabledOnly: boolean = false): McpServerConfig[] {
    return listServers(enabledOnly);
  }

  // ===================== 连接管理 =====================

  /**
   * 连接 MCP Server。
   * 启动子进程 + 初始化 MCP Client + listTools。
   *
   * @param config - Server 配置
   * @returns 连接后的 McpServerState
   */
  async connectServer(config: McpServerConfig): Promise<McpServerState> {
    // 如果已连接，先断开
    if (this.clients.has(config.id)) {
      await this.disconnectServer(config.id);
    }

    const serverPrefix = sanitizeServerName(config.name);
    this.nameToIdMap.set(serverPrefix, config.id);

    const initialState: McpServerState = {
      config,
      connectionState: 'connecting',
      tools: [],
    };

    try {
      // 1. 创建 StdioClientTransport
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env } as Record<string, string>,
      });

      // 2. 创建 MCP Client
      const client = new Client(
        { name: 'cdf-know-clow', version: '1.0.0' },
        { capabilities: {} },
      );

      // 3. 连接（带超时，防止 MCP Server 无响应时永久挂起）
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MCP 连接超时（30s）')), 30000)
        ),
      ]);

      // 4. listTools
      const toolsResult = await client.listTools();
      const tools: McpToolInfo[] = (toolsResult.tools || []).map((tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: (tool.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
      }));

      // 5. 缓存
      const entry: McpClientEntry = {
        config,
        client,
        transport,
        connectionState: 'connected',
        tools,
        lastConnectedAt: Date.now(),
      };
      this.clients.set(config.id, entry);

      const mcpToolNames = tools.map(t => makeMcpToolName(config.name, t.name));
      logger.debug(`[McpClientManager] 连接成功: ${config.name} (${config.id}), 工具: ${mcpToolNames.join(', ')}`);

      return {
        config,
        connectionState: 'connected',
        tools,
        lastConnectedAt: entry.lastConnectedAt,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[McpClientManager] 连接失败: ${config.name} (${config.id}):`, errorMsg);

      // 标记 error 状态（不存 entry，仅记录错误）
      this.nameToIdMap.delete(serverPrefix);

      return {
        ...initialState,
        connectionState: 'error',
        error: errorMsg,
      };
    }
  }

  /**
   * 断开 MCP Server 连接。
   *
   * @param serverId - Server ID
   */
  async disconnectServer(serverId: string): Promise<void> {
    const entry = this.clients.get(serverId);
    if (!entry) return;

    try {
      await entry.client.close();
    } catch (err) {
      logger.warn(`[McpClientManager] 断开连接异常 (${serverId}):`, err instanceof Error ? err.message : String(err));
    }

    const serverPrefix = sanitizeServerName(entry.config.name);
    this.nameToIdMap.delete(serverPrefix);
    this.clients.delete(serverId);
    logger.debug(`[McpClientManager] 已断开: ${entry.config.name} (${serverId})`);
  }

  /**
   * 重连 MCP Server。
   *
   * @param serverId - Server ID
   * @returns 重连后的 McpServerState
   */
  async reconnectServer(serverId: string): Promise<McpServerState | undefined> {
    const config = getServer(serverId);
    if (!config) return undefined;

    await this.disconnectServer(serverId);
    return this.connectServer(config);
  }

  /**
   * 获取所有已连接 Server 的工具（ToolDefinition 格式）。
   * 用于合并到 LLM 的 tools 列表。
   *
   * 工具名使用 mcp__{serverName}__{toolName} 格式。
   */
  getMcpTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const entry of this.clients.values()) {
      if (entry.connectionState !== 'connected') continue;

      for (const tool of entry.tools) {
        const fullToolName = makeMcpToolName(entry.config.name, tool.name);
        tools.push({
          type: 'function',
          function: {
            name: fullToolName,
            description: `[MCP/${entry.config.name}] ${tool.description}`,
            parameters: tool.inputSchema,
          },
        });
      }
    }

    return tools;
  }

  /**
   * 执行 MCP 工具。
   * 解析前缀 → 找到对应 Server → 调用 callTool。
   *
   * @param fullToolName - 完整工具名（如 mcp__filesystem__read_file）
   * @param args - 工具参数
   * @returns 工具执行结果（JSON 字符串）
   */
  async executeMcpTool(fullToolName: string, args: Record<string, unknown>): Promise<string> {
    const parsed = parseMcpToolName(fullToolName);
    if (!parsed) {
      return JSON.stringify({ error: `无效的 MCP 工具名格式: ${fullToolName}` });
    }

    const { serverPrefix, toolName } = parsed;
    const serverId = this.nameToIdMap.get(serverPrefix);
    if (!serverId) {
      return JSON.stringify({ error: `未找到 MCP Server: ${serverPrefix}` });
    }

    const entry = this.clients.get(serverId);
    if (!entry || entry.connectionState !== 'connected') {
      return JSON.stringify({ error: `MCP Server '${serverPrefix}' 未连接` });
    }

    try {
      const result = await entry.client.callTool({ name: toolName, arguments: args });
      // MCP SDK 返回的结果格式：{ content: [...], isError?: boolean }
      if (result && typeof result === 'object' && 'content' in result) {
        const content = (result as { content: Array<{ type: string; text?: string }> }).content;
        const textParts = content
          .filter((c) => c.type === 'text' && c.text !== undefined)
          .map((c) => c.text as string);
        if (textParts.length > 0) {
          return textParts.join('\n');
        }
        // 非文本内容，序列化返回
        return JSON.stringify(result);
      }
      return JSON.stringify(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: `MCP 工具执行失败: ${errorMsg}` });
    }
  }

  /**
   * 获取所有 Server 的状态。
   */
  getServerStates(): McpServerState[] {
    const allConfigs = listServers();
    const states: McpServerState[] = [];

    for (const config of allConfigs) {
      const entry = this.clients.get(config.id);
      if (entry) {
        states.push({
          config: entry.config,
          connectionState: entry.connectionState,
          tools: entry.tools,
          error: entry.error,
          lastConnectedAt: entry.lastConnectedAt,
        });
      } else {
        states.push({
          config,
          connectionState: 'disconnected',
          tools: [],
        });
      }
    }

    return states;
  }

  /**
   * 启动时批量连接所有已启用的 Server。
   */
  async connectAllEnabled(): Promise<void> {
    const enabledConfigs = listServers(true);
    if (enabledConfigs.length === 0) {
      logger.debug('[McpClientManager] 无已启用的 MCP Server');
      return;
    }

    logger.debug(`[McpClientManager] 开始连接 ${enabledConfigs.length} 个已启用的 MCP Server...`);

    for (const config of enabledConfigs) {
      try {
        await this.connectServer(config);
      } catch (err) {
        logger.error(`[McpClientManager] 启动连接 '${config.name}' 失败:`, err instanceof Error ? err.message : String(err));
      }
    }

    const connectedCount = Array.from(this.clients.values()).filter(e => e.connectionState === 'connected').length;
    logger.debug(`[McpClientManager] 启动连接完成: ${connectedCount}/${enabledConfigs.length} 成功`);
  }

  /**
   * 测试连接（不保存配置）。
   *
   * @param config - 临时配置
   * @returns 连接状态和发现的工具
   */
  async testConnection(config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<McpServerState> {
    const tempConfig: McpServerConfig = {
      ...config,
      id: '__test__',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const transport = new StdioClientTransport({
        command: tempConfig.command,
        args: tempConfig.args,
        env: { ...process.env, ...tempConfig.env } as Record<string, string>,
      });

      const client = new Client(
        { name: 'cdf-know-clow', version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);

      const toolsResult = await client.listTools();
      const tools: McpToolInfo[] = (toolsResult.tools || []).map((tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: (tool.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
      }));

      // 测试完成后关闭连接
      try {
        await client.close();
      } catch {
        // 忽略关闭错误
      }

      return {
        config: tempConfig,
        connectionState: 'connected',
        tools,
        lastConnectedAt: Date.now(),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        config: tempConfig,
        connectionState: 'error',
        tools: [],
        error: errorMsg,
      };
    }
  }

  /**
   * 关闭所有连接（进程退出时调用）。
   */
  async shutdown(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    for (const id of serverIds) {
      await this.disconnectServer(id);
    }
    logger.debug('[McpClientManager] 所有 MCP Server 连接已关闭');
  }
}

/** Module-level singleton */
export const mcpClientManager = McpClientManager.getInstance();
