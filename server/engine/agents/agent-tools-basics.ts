import { z } from 'zod';
import { logger } from '../../logger.js';
import { registerTool, type ToolDefinition } from './tool-catalog.js';

export const BasicToolInputSchema = z.object({
  message: z.string().optional(),
});

export function registerBasicTools(): void {
  const basicTools: ToolDefinition[] = [
    {
      name: 'noop',
      description: '空操作工具，用于测试',
      category: 'system',
      tags: ['test', 'utility'],
      parameters: {},
      deprecated: false,
      version: '1.0.0',
    },
    {
      name: 'echo',
      description: '回显输入的消息',
      category: 'system',
      tags: ['utility'],
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '要回显的消息' },
        },
        required: [],
      },
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      deprecated: false,
      version: '1.0.0',
    },
    {
      name: 'get_time',
      description: '获取当前时间',
      category: 'system',
      tags: ['utility', 'time'],
      parameters: {},
      deprecated: false,
      version: '1.0.0',
    },
    {
      name: 'delay',
      description: '延迟指定的毫秒数',
      category: 'system',
      tags: ['utility', 'time'],
      parameters: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: '延迟毫秒数' },
        },
        required: ['ms'],
      },
      inputSchema: {
        type: 'object',
        properties: {
          ms: { type: 'number', minimum: 0, maximum: 60000 },
        },
        required: ['ms'],
      },
      deprecated: false,
      version: '1.0.0',
    },
    {
      name: 'generate_id',
      description: '生成唯一标识符',
      category: 'system',
      tags: ['utility'],
      parameters: {
        type: 'object',
        properties: {
          prefix: { type: 'string', description: 'ID 前缀' },
        },
        required: [],
      },
      deprecated: false,
      version: '1.0.0',
    },
  ];

  for (const tool of basicTools) {
    registerTool(tool);
  }

  logger.debug(`[Agents:AgentToolsBasics] Registered ${basicTools.length} basic tools`);
}

export interface ExecuteBasicToolOptions {
  toolName: string;
  input: Record<string, unknown>;
}

export function executeBasicTool(options: ExecuteBasicToolOptions): unknown {
  const { toolName, input } = options;

  switch (toolName) {
    case 'noop':
      return { status: 'ok' };

    case 'echo':
      return { status: 'ok', message: input.message ?? '' };

    case 'get_time':
      return {
        status: 'ok',
        timestamp: Date.now(),
        iso: new Date().toISOString(),
      };

    case 'delay':
      const ms = typeof input.ms === 'number' ? input.ms : 1000;
      const end = Date.now() + Math.min(ms, 5000);
      while (Date.now() < end) {
        // 同步延迟（最大 5 秒）
      }
      return { status: 'ok', delayed: Math.min(ms, 5000) };

    case 'generate_id':
      const prefix = typeof input.prefix === 'string' ? input.prefix : 'id';
      return {
        status: 'ok',
        id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      };

    default:
      throw new Error(`Unknown basic tool: ${toolName}`);
  }
}

export function isBasicTool(toolName: string): boolean {
  return ['noop', 'echo', 'get_time', 'delay', 'generate_id'].includes(toolName);
}

logger.debug('[Agents:AgentToolsBasics] Module loaded');
