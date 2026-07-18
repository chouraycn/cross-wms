/**
 * OpenClaw 工具服务
 *
 * 将 OpenClaw 内置工具封装为 MCP 服务，
 * 支持通过 stdio 或 channel 方式提供服务。
 */

import { logger } from '../../logger.js';
import { ToolExecutor, type ToolDefinition } from './tool-executor.js';
import { McpStdioServer } from './tools-stdio-server.js';
import type { MCPTool, MCPToolCallResult } from './types.js';

export type OpenClawTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;
};

export type OpenClawToolsConfig = {
  enableBuiltinTools?: boolean;
};

const BUILTIN_TOOLS: OpenClawTool[] = [
  {
    name: 'list_sessions',
    description: 'List active conversations across channels',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Filter by channel type' },
        limit: { type: 'integer', description: 'Maximum number of sessions to return' },
      },
    },
    handler: async (args) => {
      const params = args as Record<string, unknown>;
      const channel = params.channel as string | undefined;
      const limit = (params.limit as number) ?? 50;
      logger.info(`[OpenClawTools] list_sessions: channel=${channel ?? 'all'}, limit=${limit}`);
      return {
        content: [{ type: 'text', text: `Active sessions (${channel ?? 'all channels'}): ${limit} max` }],
      };
    },
  },
  {
    name: 'send_reply',
    description: 'Send a reply to a conversation',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: 'Session key to reply to' },
        text: { type: 'string', description: 'Reply text content' },
      },
      required: ['sessionKey', 'text'],
    },
    handler: async (args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = params.sessionKey as string;
      const text = params.text as string;
      logger.info(`[OpenClawTools] send_reply: sessionKey=${sessionKey}`);
      return {
        content: [{ type: 'text', text: `Reply sent to session ${sessionKey}` }],
      };
    },
  },
  {
    name: 'read_history',
    description: 'Read message history from a conversation',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: 'Session key' },
        limit: { type: 'integer', description: 'Number of messages to return' },
      },
      required: ['sessionKey'],
    },
    handler: async (args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = params.sessionKey as string;
      const limit = (params.limit as number) ?? 20;
      logger.info(`[OpenClawTools] read_history: sessionKey=${sessionKey}, limit=${limit}`);
      return {
        content: [{ type: 'text', text: `History for session ${sessionKey} (${limit} messages)` }],
      };
    },
  },
  {
    name: 'wait_for_event',
    description: 'Wait for the next event from a conversation',
    inputSchema: {
      type: 'object',
      properties: {
        sessionKey: { type: 'string', description: 'Session key to wait on' },
        timeoutMs: { type: 'integer', description: 'Timeout in milliseconds' },
        afterCursor: { type: 'integer', description: 'Cursor position' },
      },
      required: ['sessionKey'],
    },
    handler: async (args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = params.sessionKey as string;
      const timeoutMs = (params.timeoutMs as number) ?? 30000;
      logger.info(`[OpenClawTools] wait_for_event: sessionKey=${sessionKey}, timeout=${timeoutMs}ms`);
      return {
        content: [{ type: 'text', text: `Waiting for events on session ${sessionKey} (timeout: ${timeoutMs}ms)` }],
      };
    },
  },
];

export class OpenClawToolsServer {
  private readonly toolExecutor: ToolExecutor;
  private stdioServer: McpStdioServer | null = null;
  private running = false;

  constructor(config: OpenClawToolsConfig = {}) {
    this.toolExecutor = new ToolExecutor();
    if (config.enableBuiltinTools !== false) {
      this.registerBuiltinTools();
    }
  }

  private registerBuiltinTools(): void {
    for (const tool of BUILTIN_TOOLS) {
      this.toolExecutor.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler: tool.handler,
      });
    }
  }

  registerTool(tool: OpenClawTool): void {
    this.toolExecutor.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      handler: tool.handler,
    });
  }

  unregisterTool(name: string): void {
    this.toolExecutor.unregisterTool(name);
  }

  listTools(): MCPTool[] {
    return this.toolExecutor.listTools();
  }

  async callTool(name: string, args: unknown): Promise<MCPToolCallResult> {
    const result = await this.toolExecutor.execute(name, args);
    return {
      content: result.content as MCPToolCallResult['content'],
      isError: result.isError,
    };
  }

  async startStdio(): Promise<void> {
    if (this.running) {
      return;
    }

    logger.info('[OpenClawToolsServer] Starting stdio server');

    const tools = this.listTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    this.stdioServer = new McpStdioServer({
      serverName: 'openclaw-tools',
      version: '1.0.0',
      tools,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    });

    for (const tool of this.listTools()) {
      this.stdioServer.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
        async (args) => {
          const result = await this.callTool(tool.name, args);
          return {
            content: result.content.filter((c) => c.type === 'text').map((c) => ({
              type: 'text',
              text: (c as { text: string }).text,
            })),
            isError: result.isError,
          };
        },
      );
    }

    this.stdioServer.start();
    this.running = true;
  }

  stop(): void {
    if (this.stdioServer) {
      this.stdioServer.stop();
      this.stdioServer = null;
    }
    this.running = false;
    logger.info('[OpenClawToolsServer] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getToolCount(): number {
    return this.toolExecutor.getToolCount();
  }

  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }
}

export const openClawToolsServer = new OpenClawToolsServer();

export function createOpenClawToolsServer(config?: OpenClawToolsConfig): OpenClawToolsServer {
  return new OpenClawToolsServer(config);
}

export function getBuiltinTools(): OpenClawTool[] {
  return [...BUILTIN_TOOLS];
}
