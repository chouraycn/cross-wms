/**
 * MCP 通道工具模块
 *
 * 提供基于通道的 MCP 工具能力，
 * 允许通过消息通道注册和调用 MCP 工具。
 * 支持工具发现、调用、参数验证等功能。
 */

import { logger } from '../../logger.js';
import type { McpToolInfo } from '../mcpTypes.js';
import type { MCPTool, MCPToolCallResult } from './types.js';

export type ChannelToolConfig = {
  tool: McpToolInfo;
  channel: string;
  targetClient?: string;
  timeoutMs?: number;
};

export type ChannelToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type ChannelToolEntry = {
  config: ChannelToolConfig;
  stats: {
    calls: number;
    errors: number;
    lastCallAt?: number;
  };
};

export class ChannelToolsManager {
  private tools: Map<string, ChannelToolEntry> = new Map();
  private callHandlers: Map<string, (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ChannelToolResult>> = new Map();
  private defaultTimeoutMs: number = 30000;

  registerTool(config: ChannelToolConfig): void {
    if (this.tools.has(config.tool.name)) {
      logger.warn(`[ChannelToolsManager] Overwriting existing channel tool: ${config.tool.name}`);
    }

    this.tools.set(config.tool.name, {
      config,
      stats: {
        calls: 0,
        errors: 0,
      },
    });

    logger.debug(`[ChannelToolsManager] Registered channel tool: ${config.tool.name}`);
  }

  unregisterTool(name: string): void {
    if (this.tools.has(name)) {
      this.tools.delete(name);
      logger.debug(`[ChannelToolsManager] Unregistered channel tool: ${name}`);
    }
  }

  registerCallHandler(channel: string, handler: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ChannelToolResult>): void {
    this.callHandlers.set(channel, handler);
    logger.debug(`[ChannelToolsManager] Registered call handler for channel: ${channel}`);
  }

  unregisterCallHandler(channel: string): void {
    this.callHandlers.delete(channel);
  }

  listTools(): McpToolInfo[] {
    return Array.from(this.tools.values()).map((entry) => entry.config.tool);
  }

  listMCPTools(): MCPTool[] {
    return Array.from(this.tools.values()).map((entry) => ({
      name: entry.config.tool.name,
      description: entry.config.tool.description,
      inputSchema: entry.config.tool.inputSchema,
    }));
  }

  getTool(name: string): McpToolInfo | undefined {
    const entry = this.tools.get(name);
    return entry?.config.tool;
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getToolChannel(name: string): string | undefined {
    const entry = this.tools.get(name);
    return entry?.config.channel;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ChannelToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    entry.stats.calls++;
    entry.stats.lastCallAt = Date.now();

    const handler = this.callHandlers.get(entry.config.channel);
    if (!handler) {
      entry.stats.errors++;
      return {
        content: [{ type: 'text', text: `No handler for channel: ${entry.config.channel}` }],
        isError: true,
      };
    }

    const timeoutMs = entry.config.timeoutMs ?? this.defaultTimeoutMs;

    try {
      const result = await this.withTimeout(
        handler(name, args),
        timeoutMs,
      );
      return result;
    } catch (err) {
      entry.stats.errors++;
      logger.error(`[ChannelToolsManager] Tool ${name} error: ${String(err)}`);
      return {
        content: [{ type: 'text', text: `Tool error: ${String(err)}` }],
        isError: true,
      };
    }
  }

  toMCPToolCallResult(result: ChannelToolResult): MCPToolCallResult {
    return {
      content: result.content as MCPToolCallResult['content'],
      isError: result.isError,
    };
  }

  getToolStats(name: string): { calls: number; errors: number; lastCallAt?: number } | undefined {
    const entry = this.tools.get(name);
    if (!entry) {
      return undefined;
    }
    return { ...entry.stats };
  }

  getAllStats(): Map<string, { calls: number; errors: number; lastCallAt?: number }> {
    const result = new Map<string, { calls: number; errors: number; lastCallAt?: number }>();
    for (const [name, entry] of this.tools) {
      result.set(name, { ...entry.stats });
    }
    return result;
  }

  getToolCount(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
    this.callHandlers.clear();
    logger.debug('[ChannelToolsManager] Cleared all channel tools');
  }

  setDefaultTimeout(timeoutMs: number): void {
    this.defaultTimeoutMs = timeoutMs;
  }

  getDefaultTimeout(): number {
    return this.defaultTimeoutMs;
  }

  listChannels(): string[] {
    const channels = new Set<string>();
    for (const entry of this.tools.values()) {
      channels.add(entry.config.channel);
    }
    return Array.from(channels);
  }

  getToolsByChannel(channel: string): McpToolInfo[] {
    const result: McpToolInfo[] = [];
    for (const entry of this.tools.values()) {
      if (entry.config.channel === channel) {
        result.push(entry.config.tool);
      }
    }
    return result;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool call timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
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

  validateToolArgs(name: string, args: Record<string, unknown>): { valid: boolean; error?: string } {
    const entry = this.tools.get(name);
    if (!entry) {
      return { valid: false, error: `Tool not found: ${name}` };
    }

    const schema = entry.config.tool.inputSchema;
    if (!schema || !schema.properties) {
      return { valid: true };
    }

    const required = (schema as { required?: string[] }).required ?? [];
    const properties = schema.properties as Record<string, { type?: string; enum?: unknown[] }>;

    for (const req of required) {
      if (args[req] === undefined) {
        return { valid: false, error: `Missing required argument: ${req}` };
      }
    }

    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (propSchema) {
        const typeCheck = this.checkArgType(value, propSchema.type);
        if (!typeCheck.valid) {
          return { valid: false, error: `Argument ${key} has wrong type: ${typeCheck.error}` };
        }

        if (propSchema.enum && !propSchema.enum.includes(value)) {
          return { valid: false, error: `Argument ${key} must be one of: ${propSchema.enum.join(', ')}` };
        }
      }
    }

    return { valid: true };
  }

  private checkArgType(value: unknown, type?: string): { valid: boolean; error?: string } {
    if (!type) {
      return { valid: true };
    }

    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: 'expected string' };
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          return { valid: false, error: 'expected number' };
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: 'expected boolean' };
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return { valid: false, error: 'expected array' };
        }
        break;
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return { valid: false, error: 'expected object' };
        }
        break;
      default:
        break;
    }

    return { valid: true };
  }
}

export const channelToolsManager = new ChannelToolsManager();

export function registerChannelTool(config: ChannelToolConfig): void {
  channelToolsManager.registerTool(config);
}

export function callChannelTool(name: string, args: Record<string, unknown>): Promise<ChannelToolResult> {
  return channelToolsManager.callTool(name, args);
}

export function listChannelTools(): McpToolInfo[] {
  return channelToolsManager.listTools();
}
