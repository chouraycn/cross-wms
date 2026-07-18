/**
 * MCP 插件工具服务
 *
 * 提供插件工具的 MCP 服务能力，
 * 负责插件工具的注册、发现和调用。
 * 支持热加载、动态注册和插件生命周期管理。
 */

import { logger } from '../../logger.js';
import type { McpToolInfo } from '../mcpTypes.js';
import {
  MCPErrorCode,
  MCPMethod,
  type MCPTool,
  type MCPToolCallResult,
} from './types.js';
import { PluginToolHandlers, type ToolDefinition, type ToolHandler, type ToolHandlerResult } from './plugin-tools-handlers.js';

export type PluginToolServeConfig = {
  pluginId: string;
  pluginName?: string;
  tools?: Array<ToolDefinition & { handler: ToolHandler }>;
  autoRegister?: boolean;
};

export type PluginInfo = {
  id: string;
  name: string;
  toolCount: number;
  registeredAt: number;
  enabled: boolean;
};

type PluginEntry = {
  id: string;
  name: string;
  enabled: boolean;
  registeredAt: number;
  tools: Map<string, ToolDefinition & { handler: ToolHandler }>;
};

export class PluginToolsServe {
  private readonly toolHandlers: PluginToolHandlers;
  private plugins: Map<string, PluginEntry> = new Map();
  private initialized = false;

  constructor(toolHandlers?: PluginToolHandlers) {
    this.toolHandlers = toolHandlers ?? new PluginToolHandlers();
  }

  async initialize(config?: PluginToolServeConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[PluginToolsServe] Initializing plugin tools serve');

    if (config?.tools && config.pluginId) {
      this.registerPlugin({
        id: config.pluginId,
        name: config.pluginName ?? config.pluginId,
        tools: config.tools,
      });
    }

    this.initialized = true;
  }

  registerPlugin(config: {
    id: string;
    name?: string;
    tools?: Array<ToolDefinition & { handler: ToolHandler }>;
    enabled?: boolean;
  }): void {
    const pluginEntry: PluginEntry = {
      id: config.id,
      name: config.name ?? config.id,
      enabled: config.enabled ?? true,
      registeredAt: Date.now(),
      tools: new Map(),
    };

    if (config.tools) {
      for (const tool of config.tools) {
        pluginEntry.tools.set(tool.name, tool);
        if (pluginEntry.enabled) {
          this.toolHandlers.registerTool(tool, tool.handler, { pluginId: config.id });
        }
      }
    }

    this.plugins.set(config.id, pluginEntry);
    logger.info(`[PluginToolsServe] Registered plugin: ${config.id} (${pluginEntry.tools.size} tools)`);
  }

  unregisterPlugin(pluginId: string): boolean {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return false;
    }

    this.toolHandlers.unregisterPluginTools(pluginId);
    this.plugins.delete(pluginId);
    logger.info(`[PluginToolsServe] Unregistered plugin: ${pluginId}`);
    return true;
  }

  enablePlugin(pluginId: string): boolean {
    const entry = this.plugins.get(pluginId);
    if (!entry || entry.enabled) {
      return false;
    }

    entry.enabled = true;
    for (const tool of entry.tools.values()) {
      this.toolHandlers.registerTool(tool, tool.handler, { pluginId });
    }

    logger.info(`[PluginToolsServe] Enabled plugin: ${pluginId}`);
    return true;
  }

  disablePlugin(pluginId: string): boolean {
    const entry = this.plugins.get(pluginId);
    if (!entry || !entry.enabled) {
      return false;
    }

    entry.enabled = false;
    this.toolHandlers.unregisterPluginTools(pluginId);

    logger.info(`[PluginToolsServe] Disabled plugin: ${pluginId}`);
    return true;
  }

  isPluginEnabled(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.enabled ?? false;
  }

  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  getPluginInfo(pluginId: string): PluginInfo | undefined {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return undefined;
    }
    return {
      id: entry.id,
      name: entry.name,
      toolCount: entry.tools.size,
      registeredAt: entry.registeredAt,
      enabled: entry.enabled,
    };
  }

  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((entry) => ({
      id: entry.id,
      name: entry.name,
      toolCount: entry.tools.size,
      registeredAt: entry.registeredAt,
      enabled: entry.enabled,
    }));
  }

  getPluginCount(): number {
    return this.plugins.size;
  }

  registerTool(
    pluginId: string,
    definition: ToolDefinition,
    handler: ToolHandler,
  ): boolean {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      logger.warn(`[PluginToolsServe] Cannot register tool: plugin not found: ${pluginId}`);
      return false;
    }

    entry.tools.set(definition.name, { ...definition, handler });

    if (entry.enabled) {
      this.toolHandlers.registerTool(definition, handler, { pluginId });
    }

    logger.debug(`[PluginToolsServe] Registered tool ${definition.name} for plugin ${pluginId}`);
    return true;
  }

  unregisterTool(pluginId: string, toolName: string): boolean {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return false;
    }

    if (!entry.tools.has(toolName)) {
      return false;
    }

    entry.tools.delete(toolName);

    if (entry.enabled) {
      this.toolHandlers.unregisterTool(toolName);
    }

    logger.debug(`[PluginToolsServe] Unregistered tool ${toolName} from plugin ${pluginId}`);
    return true;
  }

  listTools(pluginId?: string): ToolDefinition[] {
    if (pluginId) {
      const entry = this.plugins.get(pluginId);
      if (!entry) {
        return [];
      }
      return Array.from(entry.tools.values()).map((t) => {
        const { handler: _handler, ...rest } = t;
        return rest;
      });
    }

    return this.toolHandlers.listToolDefinitions();
  }

  listMCPTools(pluginId?: string): MCPTool[] {
    const tools = this.listTools(pluginId);
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
    }));
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { sessionId?: string; requestId?: string | number; pluginId?: string },
  ): Promise<MCPToolCallResult> {
    const result = await this.toolHandlers.executeTool(toolName, args, options);
    return {
      content: result.content as MCPToolCallResult['content'],
      isError: result.isError,
    };
  }

  async handleMCPRequest(
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }> {
    switch (method) {
      case MCPMethod.TOOLS_LIST: {
        const tools = this.listMCPTools();
        return { result: { tools } };
      }

      case MCPMethod.TOOLS_CALL: {
        const name = params?.name as string | undefined;
        const args = (params?.arguments as Record<string, unknown>) ?? {};

        if (!name) {
          return {
            error: {
              code: MCPErrorCode.INVALID_PARAMS,
              message: 'Tool name is required',
            },
          };
        }

        const result = await this.callTool(name, args);
        return { result };
      }

      default:
        return {
          error: {
            code: MCPErrorCode.METHOD_NOT_FOUND,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  getToolHandlers(): PluginToolHandlers {
    return this.toolHandlers;
  }

  getToolCount(): number {
    return this.toolHandlers.getToolCount();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  clear(): void {
    this.plugins.clear();
    this.toolHandlers.clear();
    this.initialized = false;
    logger.debug('[PluginToolsServe] Cleared all plugins and tools');
  }

  getToolsByPlugin(pluginId: string): ToolDefinition[] {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return [];
    }
    return Array.from(entry.tools.values()).map((t) => {
      const { handler: _handler, ...rest } = t;
      return rest;
    });
  }

  toMcpToolInfos(pluginId?: string): McpToolInfo[] {
    const tools = this.listTools(pluginId);
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
    }));
  }
}

export const pluginToolsServe = new PluginToolsServe();

export function registerPluginTools(config: PluginToolServeConfig): void {
  if (config.tools && config.pluginId) {
    pluginToolsServe.registerPlugin({
      id: config.pluginId,
      name: config.pluginName,
      tools: config.tools,
      enabled: config.autoRegister ?? true,
    });
  }
}

export async function callPluginTool(
  toolName: string,
  args: Record<string, unknown>,
  options?: { sessionId?: string; requestId?: string | number },
): Promise<ToolHandlerResult> {
  return pluginToolsServe.getToolHandlers().executeTool(toolName, args, options);
}

export function listPluginTools(): ToolDefinition[] {
  return pluginToolsServe.listTools();
}
